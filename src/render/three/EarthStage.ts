import * as THREE from 'three';
import { WGS84_A, geodeticToEcef, ecefToThree, geodeticNormal } from '../../geo/ecef';
import { sunDirectionEcef, subsolarPoint } from '../../geo/sky';
import { interpolateRig, rigToOrbit, type CameraRig } from '../shared/rig';
import earthVert from './shaders/earth.vert.glsl?raw';
import surfaceFrag from './shaders/surface.frag.glsl?raw';
import atmosphereCore from './shaders/atmosphere.glsl?raw';
import atmosphereMain from './shaders/atmosphere.frag.glsl?raw';
import cloudsFrag from './shaders/clouds.frag.glsl?raw';

const RAD = Math.PI / 180;

export interface StageOptions { dpr: number; lonSeg: number; latSeg: number; timeRate: number; atmoView: number; atmoLight: number }
export interface Stats { running: boolean; frames: number; disposed: boolean; programs: number; programNames: string[]; shaderErrors: number; drawCalls: number }

const VERT = earthVert;
const SURFACE_FRAG = surfaceFrag;
const ATMO_FRAG = atmosphereCore + atmosphereMain; // physically based Rayleigh + Mie single scattering (see shaders/atmosphere.glsl)

/** Earth mesh parameterised by GEODETIC lon/lat through the WGS84 ellipsoid, so it lines up with Cesium's globe and with GIBS' EPSG:4326 imagery. Unit = Earth equatorial radius. */
export function buildEarthGeometry(lonSeg: number, latSeg: number): THREE.BufferGeometry {
  const nv = (lonSeg + 1) * (latSeg + 1);
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  let k = 0;
  for (let i = 0; i <= latSeg; i++) {
    for (let j = 0; j <= lonSeg; j++, k++) {
      const lon = -180 + (360 * j) / lonSeg, lat = -90 + (180 * i) / latSeg;
      const p = ecefToThree(geodeticToEcef(lon, lat, 0)), n = ecefToThree(geodeticNormal(lon, lat));
      pos.set([p[0] / WGS84_A, p[1] / WGS84_A, p[2] / WGS84_A], k * 3);
      nor.set(n, k * 3);
      uv.set([j / lonSeg, i / latSeg], k * 2);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < latSeg; i++) {
    for (let j = 0; j < lonSeg; j++) {
      const a = i * (lonSeg + 1) + j, b = a + 1, c = a + (lonSeg + 1), d = c + 1;
      idx.push(a, b, d, a, d, c); // counter-clockwise seen from outside
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class EarthStage {
  frames = 0;
  running = false;
  disposed = false;
  shaderErrors = 0;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
  private sun = new THREE.Vector3(1, 0, 0);
  private surface: THREE.ShaderMaterial;
  private geometry: THREE.BufferGeometry;
  private atmoMat: THREE.ShaderMaterial;
  private map: THREE.Texture | null = null;
  private nightMap: THREE.Texture | null = null;
  private cloudMap: THREE.Texture | null = null;
  private cloudMat: THREE.ShaderMaterial | null = null;
  private clouds: THREE.Mesh | null = null;
  private stars!: THREE.Points;
  private fly: { from: CameraRig; to: CameraRig; t0: number; ms: number } | null = null;
  private yaw: number;
  private pitch = 20 * RAD;
  private dist = 3.6;
  private t0 = performance.now();
  private baseMs = Date.now();

  constructor(private canvas: HTMLCanvasElement, private opts: StageOptions) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.dpr));
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.debug.onShaderError = () => { this.shaderErrors++; console.error('EarthStage: a shader failed to compile'); };

    this.geometry = buildEarthGeometry(opts.lonSeg, opts.latSeg);
    const uniforms = { dayMap: { value: null as THREE.Texture | null }, nightMap: { value: null as THREE.Texture | null }, hasNight: { value: 0 }, sunDir: { value: this.sun } };
    this.surface = new THREE.ShaderMaterial({ name: 'surface-day-night', uniforms, vertexShader: VERT, fragmentShader: SURFACE_FRAG });
    this.atmoMat = new THREE.ShaderMaterial({
      name: 'atmosphere-scattering', defines: { VS: opts.atmoView, LS: opts.atmoLight },
      uniforms: { sunDir: { value: this.sun }, exposure: { value: 0.8 } }, vertexShader: VERT, fragmentShader: ATMO_FRAG,
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, // premultiplied
    });
    const earth = new THREE.Mesh(this.geometry, this.surface);
    const atmo = new THREE.Mesh(this.geometry, this.atmoMat);
    atmo.scale.setScalar(1.01456); // top of atmosphere, +100 km (matches RA in atmosphere.glsl)
    atmo.renderOrder = 2;
    this.scene.add(earth, atmo);
    this.addStars();

    this.yaw = (subsolarPoint(new Date()).lon - 35 + 90) * RAD; // open with the terminator in view
    this.bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Swap in a (better) day texture; the previous one is released. */
  setMap(tex: THREE.Texture) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.surface.uniforms.dayMap.value = tex;
    this.map?.dispose();
    this.map = tex;
  }

  /** Optional night-side city lights. */
  setNightMap(tex: THREE.Texture) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.surface.uniforms.nightMap.value = tex;
    this.surface.uniforms.hasNight.value = 1;
    this.nightMap?.dispose();
    this.nightMap = tex;
  }

  /** Optional real, date-stamped cloud mask (alpha). Adds the cloud shell on first use. */
  setCloudMap(tex: THREE.Texture) {
    tex.colorSpace = THREE.NoColorSpace; // data, not colour
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    if (!this.cloudMat) {
      this.cloudMat = new THREE.ShaderMaterial({ name: 'cloud-layer', uniforms: { cloudMap: { value: tex }, sunDir: { value: this.sun } }, vertexShader: VERT, fragmentShader: cloudsFrag, transparent: true, depthWrite: false });
      this.clouds = new THREE.Mesh(this.geometry, this.cloudMat);
      this.clouds.scale.setScalar(1.004);
      this.clouds.renderOrder = 1;
      this.scene.add(this.clouds);
    } else {
      this.cloudMat.uniforms.cloudMap.value = tex;
    }
    this.cloudMap?.dispose();
    this.cloudMap = tex;
  }

  /** The simulated UTC instant being lit (real Sun position for this time). */
  simDate(): Date { return new Date(this.baseMs + (performance.now() - this.t0) * this.opts.timeRate); }

  /** Jump the camera to a position (degrees, metres above the ellipsoid). */
  setRig(r: Pick<CameraRig, 'lon' | 'lat' | 'alt'>) {
    const o = rigToOrbit(r);
    this.fly = null;
    this.yaw = o.yaw;
    this.pitch = Math.max(-1.35, Math.min(1.35, o.pitch));
    this.dist = Math.max(1.35, Math.min(8, o.dist));
  }

  /** Fly the camera along a great circle with log-space altitude. Any drag or wheel input cancels the flight. */
  flyTo(to: CameraRig, ms = 2200) {
    if (this.disposed) return;
    this.fly = { from: this.rig(), to, t0: performance.now(), ms };
  }

  start() { this.running = true; this.renderer.setAnimationLoop(this.tick); }
  stop() { this.running = false; this.renderer.setAnimationLoop(null); }

  dispose() {
    this.stop();
    this.map?.dispose(); this.nightMap?.dispose(); this.cloudMap?.dispose(); this.cloudMat?.dispose(); this.stars.geometry.dispose(); (this.stars.material as THREE.Material).dispose(); this.geometry.dispose(); this.surface.dispose(); this.atmoMat.dispose(); this.renderer.dispose();
    this.disposed = true;
  }

  stats(): Stats {
    const info = this.renderer.info, progs = info.programs ?? [];
    return { running: this.running, frames: this.frames, disposed: this.disposed, programs: progs.length, programNames: progs.map((p) => p.name), shaderErrors: this.shaderErrors, drawCalls: info.render.calls };
  }

  rig() {
    return { lon: ((this.yaw / RAD - 90 + 540) % 360) - 180, lat: this.pitch / RAD, alt: (this.dist - 1) * WGS84_A, heading: 0, pitch: -90, roll: 0, fovV: this.camera.fov };
  }

  private tick = () => {
    const sim = this.simDate();
    const s = ecefToThree(sunDirectionEcef(sim));
    if (this.clouds) this.clouds.rotation.y = -((sim.getTime() - this.baseMs) / 1000) * 1.5e-6; // illustrative drift against the ground
    this.sun.set(s[0], s[1], s[2]);
    if (this.fly) {
      const p = Math.min(1, (performance.now() - this.fly.t0) / this.fly.ms);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; // ease in-out
      const o = rigToOrbit(interpolateRig(this.fly.from, this.fly.to, e));
      this.yaw = o.yaw; this.pitch = o.pitch; this.dist = Math.max(1.35, o.dist);
      if (p >= 1) this.fly = null;
    }
    const c = Math.cos(this.pitch);
    this.camera.position.set(this.dist * c * Math.sin(this.yaw), this.dist * Math.sin(this.pitch), this.dist * c * Math.cos(this.yaw));
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
    this.frames++;
  };

  /** Decorative starfield (deterministic pseudo-random): NOT a star map, and the site says so. */
  private addStars() {
    let seed = 1234567;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const n = 2200, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, a = rnd() * 6.2832, r = Math.sqrt(1 - u * u);
      pos.set([60 * r * Math.cos(a), 60 * u, 60 * r * Math.sin(a)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfd8e6, size: 0.16, sizeAttenuation: true, transparent: true, opacity: 0.7, depthWrite: false }));
    this.scene.add(this.stars);
  }

  private resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    const a = w / h;
    this.camera.aspect = a;
    this.camera.fov = a >= 1 ? 38 : Math.min(78, Math.max(38, (2 * Math.atan((0.344 * 0.85) / a)) / RAD));
    this.camera.updateProjectionMatrix();
  }

  private bindInput() {
    let down = false, lx = 0, ly = 0;
    this.canvas.addEventListener('pointerdown', (e) => { this.fly = null; down = true; lx = e.clientX; ly = e.clientY; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!down) return;
      const k = 0.005 * Math.min(1, this.dist / 3);
      this.yaw -= (e.clientX - lx) * k;
      this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch + (e.clientY - ly) * k));
      lx = e.clientX; ly = e.clientY;
    });
    const up = () => { down = false; };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.fly = null; this.dist = Math.max(1.35, Math.min(8, this.dist * Math.exp(e.deltaY * 0.001))); }, { passive: false });
  }
}
