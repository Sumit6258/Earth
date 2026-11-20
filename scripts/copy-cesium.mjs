#!/usr/bin/env node
// Copies Cesium's static runtime assets (workers, third-party code, images, widget CSS) into public/cesium so that
// window.CESIUM_BASE_URL = '/cesium/' works in dev, in the Playwright preview and on GitHub Pages.
import fs from 'node:fs';
import path from 'node:path';

if (process.env.SKIP_CESIUM === '1') { console.log('SKIP_CESIUM=1: not copying Cesium assets'); process.exit(0); }
const SRC = 'node_modules/cesium/Build/Cesium', DST = 'public/cesium';
if (!fs.existsSync(SRC)) { console.error(`cesium is not installed (${SRC} is missing). Run npm install.`); process.exit(1); }
for (const d of ['Workers', 'ThirdParty', 'Assets', 'Widgets']) fs.cpSync(path.join(SRC, d), path.join(DST, d), { recursive: true });
console.log('copied Cesium static assets to public/cesium');
