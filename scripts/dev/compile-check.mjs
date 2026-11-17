// Dev/CI tool. Compile + link the SHIPPED shader files the way Three.js assembles them for WebGL2 (GLSL ES 3.00 with its compatibility defines).
import fs from 'node:fs';
import { chromium } from '@playwright/test';
const dir = new URL('../../src/render/three/shaders/', import.meta.url).pathname;
const read = (f) => fs.readFileSync(dir + f, 'utf8');
const vertPrefix = '#version 300 es\nprecision highp float;\nprecision highp int;\nuniform mat4 modelMatrix; uniform mat4 viewMatrix; uniform mat4 projectionMatrix;\nin vec3 position; in vec3 normal; in vec2 uv;\n#define varying out\n';
const fragPrefix = '#version 300 es\nprecision highp float;\nprecision highp int;\nuniform mat4 viewMatrix; uniform vec3 cameraPosition;\n#define varying in\nlayout(location = 0) out highp vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n#define texture2D texture\n';
const programs = {
  'surface (day/night + city lights)': [vertPrefix + read('earth.vert.glsl'), fragPrefix + read('surface.frag.glsl').replace('#include <colorspace_fragment>', '')],
  'clouds (real MODIS mask, sun-lit)': [vertPrefix + read('earth.vert.glsl'), fragPrefix + read('clouds.frag.glsl').replace('#include <colorspace_fragment>', '')],
  'atmosphere (Rayleigh+Mie, high tier VS16/LS6)': [vertPrefix + read('earth.vert.glsl'), fragPrefix + '#define VS 16\n#define LS 6\n' + read('atmosphere.glsl') + read('atmosphere.frag.glsl')],
  'atmosphere (performance tier VS8/LS3)': [vertPrefix + read('earth.vert.glsl'), fragPrefix + '#define VS 8\n#define LS 3\n' + read('atmosphere.glsl') + read('atmosphere.frag.glsl')],
};
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.setContent('<canvas id=c></canvas>');
const out = await p.evaluate((programs) => {
  const gl = document.getElementById('c').getContext('webgl2'); const res = {};
  for (const [name, [vs, fs]] of Object.entries(programs)) {
    const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : (() => { throw new Error((t === gl.VERTEX_SHADER ? 'vertex: ' : 'fragment: ') + gl.getShaderInfoLog(sh)); })(); };
    try { const pr = gl.createProgram(); gl.attachShader(pr, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr); res[name] = gl.getProgramParameter(pr, gl.LINK_STATUS) ? 'OK (compiled + linked)' : 'LINK ERROR: ' + gl.getProgramInfoLog(pr); }
    catch (e) { res[name] = 'ERROR: ' + String(e.message).slice(0, 300); }
  }
  return res;
}, programs);
for (const [k, v] of Object.entries(out)) console.log(`${v.startsWith('OK') ? '✔' : '✘'} ${k}: ${v}`);
await b.close();
process.exit(Object.values(out).every((v) => v.startsWith('OK')) ? 0 : 1);
