import * as THREE from 'three';
import { WGS84_A, geodeticToEcef, ecefToThree, geodeticNormal } from '../../geo/ecef';
import { sunDirectionEcef, subsolarPoint } from '../../geo/sky';

const RAD = Math.PI / 180;

export interface StageOptions { dpr: number; lonSeg: number; latSeg: number; timeRate: number }
export interface Stats { running: boolean; frames: number; disposed: boolean; programs: number; programNames: string[]; shaderErrors: number; drawCalls: number }

const VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() {
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const SURFACE_FRAG = /* glsl */ `
uniform sampler2D dayMap; uniform vec3 sunDir;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() {
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW), S = normalize(sunDir);
  vec3 albedo = texture2D(dayMap, vUv).rgb;
  float d = dot(N, S);
  float day = smoothstep(-0.06, 0.20, d);
  vec3 twilight = mix(vec3(1.0), vec3(1.0, 0.72, 0.52), exp(-d * d * 40.0) * 0.5);
  vec3 col = albedo * (0.02 + 1.05 * day) * twilight;
  float fr = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += vec3(0.25, 0.50, 1.0) * fr * (0.08 + 0.92 * day) * 0.55;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// Interim limb glow. M1b replaces it with Rayleigh + Mie single scattering.
const ATMO_FRAG = /* glsl */ `
uniform vec3 sunDir;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float k = clamp(-dot(normalize(vN), V) * 2.6, 0.0, 1.0);
  float a = pow(k, 2.4);
  float lit = 0.10 + 0.90 * smoothstep(-0.25, 0.40, dot(normalize(vW), normalize(sunDir)));
  vec3 c = mix(vec3(0.18, 0.40, 0.95), vec3(0.55, 0.78, 1.0), pow(k, 3.0));
  gl_FragColor = vec4(c, a * lit);
}`;

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
    const uniforms = { dayMap: { value: null as THREE.Texture | null }, sunDir: { value: this.sun } };
    this.surface = new THREE.ShaderMaterial({ name: 'surface-day-night', uniforms, vertexShader: VERT, fragmentShader: SURFACE_FRAG });
    this.atmoMat = new THREE.ShaderMaterial({
      name: 'atmosphere-rim', uniforms: { sunDir: { value: this.sun } }, vertexShader: VERT, fragmentShader: ATMO_FRAG,
      transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    });
    const earth = new THREE.Mesh(this.geometry, this.surface);
    const atmo = new THREE.Mesh(this.geometry, this.atmoMat);
    atmo.scale.setScalar(1.035);
    atmo.renderOrder = 2;
    this.scene.add(earth, atmo);

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

  start() { this.running = true; this.renderer.setAnimationLoop(this.tick); }
  stop() { this.running = false; this.renderer.setAnimationLoop(null); }

  dispose() {
    this.stop();
    this.map?.dispose(); this.geometry.dispose(); this.surface.dispose(); this.atmoMat.dispose(); this.renderer.dispose();
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
    const simMs = this.baseMs + (performance.now() - this.t0) * this.opts.timeRate;
    const s = ecefToThree(sunDirectionEcef(new Date(simMs)));
    this.sun.set(s[0], s[1], s[2]);
    const c = Math.cos(this.pitch);
    this.camera.position.set(this.dist * c * Math.sin(this.yaw), this.dist * Math.sin(this.pitch), this.dist * c * Math.cos(this.yaw));
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
    this.frames++;
  };

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
    this.canvas.addEventListener('pointerdown', (e) => { down = true; lx = e.clientX; ly = e.clientY; this.canvas.setPointerCapture(e.pointerId); });
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
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.dist = Math.max(1.35, Math.min(8, this.dist * Math.exp(e.deltaY * 0.001))); }, { passive: false });
  }
}
