# EARTH — Implementation Kickoff Brief

> **Educational use only.** This repository is published so people can study how it is built. EARTH (earth.sumitsuman.com) is a **privately owned project of Sumit Suman**. The code, design, text and compiled site are © 2026 Sumit Suman, all rights reserved. No permission is given to copy, redistribute, deploy or commercialise any part of it; see [LICENSE](LICENSE). The run instructions below are written for the owner; anyone else may follow them only to study the project on their own computer.

Version 1 · written 14 November 2026 · owner: Sumit Suman · production target: `earth.sumitsuman.com`

**How to read the markers.** ✔ = checked against a live source on 14 Nov 2026 while writing this. ⚠ = believed correct but *not* verified; a named script or milestone settles it. ✘ = known unavailable. Nothing in this brief was run against an EARTH app, because none exists yet; what *was* executed is listed in §8.6.

---

## 0. Operating rules for the implementing agent

1. Read this whole document, then run `node scripts/preflight.mjs`. If it prints `BLOCKED`, **stop**: write `docs/reports/M0-blocked.md` from `docs/reports/TEMPLATE.md` naming each failed check and the unblock action. Do not scaffold anything.
2. Execute **M0 only**, then stop at its gate for the owner. Each later milestone starts only when the previous one is GREEN in `docs/STATUS.md` *and* the owner has said go.
3. Nothing is "done" without evidence. A ledger row is PASS only when its tests pass on both desktop and mobile projects and the evidence files are committed (§9).
4. Owner's non-negotiables: no template or generic-AI aesthetic, and no design-generation skill (build the interface by hand); no fabricated data, dates or statistics; projections are always labelled as projections; secrets stay server-side; no dependency that is not imported; Three.js, CesiumJS and GSAP must each perform real work; never report an untested thing as tested.
5. Decide routine things yourself using the defaults here. **Stop and ask** only for items in §11 marked *owner decision*.

---

## 1. Gate 0 — verify the environment (do not assume it)

### 1.1 What I verified in the chat sandbox where this brief was written (14 Nov 2026)

Raw output: `evidence/chat-sandbox-preflight.json` in the package. **Verdict: it cannot host this project.**

| Capability you asked about | Result | Detail |
|---|---|---|
| Internet access | ✘ | DNS resolution fails for every host probed (the packaged evidence covers the npm registry, NASA GIBS, GISS, NOAA GML, NSIDC, FIRMS, Global Forest Watch, Copernicus, Cesium and Playwright's CDN; an earlier manual check also failed for GitHub and jsDelivr). |
| npm / package installation | ✘ | Node 22.23.4 and npm 10.9.9 exist, but `npm install` fails with `ENOTFOUND`. |
| External imagery and APIs | ✘ | Follows from the above: not one GIBS tile or dataset could be fetched. |
| Persistent repository and terminal | ✘ | A bash tool exists and git 2.43 is installed, but there is no repository and no remote, and this sandbox's own rules say its filesystem resets between tasks. |
| Browser automation | **✔** | **Correction to my earlier message:** I told you there was no browser here. That was wrong; I had checked `PATH` and `~/.cache` only. Playwright 1.63.0 with a preinstalled Chromium (build 1243, `/opt/pw-browsers`) runs, and headless **WebGL2 works via SwiftShader (software)**. The 9 harness tests in this package pass here on desktop and mobile. |
| Run and preview | partial | A server can run and be reached on localhost *inside* the sandbox. There is no inbound route for a human; the only publish path is a single-file page that is forbidden from loading outside images, tiles or APIs. |
| Hardware | — | 1 vCPU, 4 GB RAM, ~11 GB free disk, **no GPU**. |

### 1.2 What I could not verify

**Your actual cloud environment.** You have not named it and I have no access to it. `scripts/preflight.mjs` verifies every item above *in whatever environment runs it*, writes `docs/evidence/M0/preflight.json`, and exits non-zero if any REQUIRED check fails. It deliberately uses `curl` rather than Node's `fetch`, because cloud agent VMs route egress through a proxy that Node's built-in `fetch` ignores by default. It also checks `npm install` through the real npm client, creates a real WebGL2 context in headless Chromium, and lists Playwright's browser-download hosts via `npx playwright install --dry-run chromium`, then probes them.

### 1.3 What the environment must provide

| Capability | Why EARTH needs it | Pass criterion (preflight id) |
|---|---|---|
| Outbound HTTPS to npm | Three, Cesium, GSAP, Vite, Playwright, sharp | `npm.registry`, `npm.install` |
| Outbound HTTPS to NASA GIBS | Real imagery; texture build; Cesium tiles | `gibs.tile.static`, `gibs.tile.dated`, `gibs.tile.3857`, `gibs.capabilities` — and a CORS header on tiles |
| Outbound HTTPS to science data hosts | GISTEMP, NOAA GML, NSIDC, FIRMS, GFW, Copernicus CDS | `giss.*`, `noaa.co2`, `nsidc.*`, `firms.*`, `gfw.*`, `copernicus.cds` (RECOMMENDED until M3/M4) |
| Persistent git repo with push access | Work must survive the session and feed preview deploys | `repo.worktree`, `repo.origin`, `repo.remote_read`, `repo.remote_write` |
| Browser automation with WebGL2 | The acceptance suite and screenshots | `browser.playwright`, `browser.webgl2` |
| A way for a human to *see* it on a real GPU | Software-GL screenshots prove correctness, not look or frame rate | `preview.human` (a deployed branch preview, or Codespaces port forwarding) |
| ≥ 4 vCPU, ≥ 8 GB RAM, ≥ 15 GB disk | Software WebGL2 plus Cesium is CPU and memory heavy | `runtime.machine` (INFO; judge by the numbers) |

### 1.4 Recommended environment

Facts below are from Anthropic's cloud-environment documentation (✔ read 14 Nov 2026) unless marked.

- Cloud sessions run on a fresh Ubuntu 24.04 x86_64 VM with up to roughly 4 vCPU, 16 GB RAM and 30 GB disk; Node 22 is the default. Playwright is **not** preinstalled there. No GPU is documented, so assume software rendering.
- **Network access has four levels: None, Trusted (the default allowlist), Full, Custom.** Trusted includes npm, GitHub, PyPI, `*.googleapis.com`, `*.amazonaws.com` and Node's download host, but **none** of the NASA, NOAA, NSIDC or GFW hosts and none of Playwright's download hosts. Under the default, EARTH cannot be built. Use **Custom** (defaults plus §1.5).
- You do not get an interactive shell in the VM; the agent runs every command. Persistence is the GitHub branch it pushes. Foreground commands time out (default 2 minutes, up to 10), so long Playwright runs must be started in the background and polled. Setup scripts are cached only if they finish within about 5 minutes.
- ⚠ No built-in browser pane or port forwarding for cloud sessions (one third-party source says so; confirm in your account). Therefore the **human preview must be a deployed branch preview** (§7.7).

| Option | Use when | Caveats |
|---|---|---|
| **A. Claude Code cloud session + GitHub + Git-integrated preview host (recommended)** | You want zero local compute | No GPU; no interactive terminal; network must be Custom; browser download hosts must be allowed |
| B. GitHub Codespaces (or similar) with the Claude Code CLI inside | You want a real terminal and port-forwarded preview | ⚠ Not verified in this session; check machine size (4-core minimum), allowed outbound hosts, and cost |
| C. A GPU runner (any cloud VM with a GPU running headless Chromium) | **Only from M6**, to measure real frame rate | Needed because CPU-only machines cannot prove performance; otherwise the owner checks on a real device via the preview URL |

### 1.5 Hosts to allow (Custom network)

`gibs.earthdata.nasa.gov` (optionally `gibs-a/b/c.earthdata.nasa.gov`) · `data.giss.nasa.gov` · `gml.noaa.gov` · `noaadata.apps.nsidc.org` and `nsidc.org` · `firms.modaps.eosdis.nasa.gov` · `tiles.globalforestwatch.org` and `data-api.globalforestwatch.org` · `cds.climate.copernicus.eu` · `cdn.playwright.dev` and `playwright.download.prss.microsoft.com` · `api.cesium.com` and `assets.ion.cesium.com` (only if Cesium ion terrain is used) · the host(s) that serve the chosen cloud and night-light textures (⚠ discover in M0; NASA has been moving Visible Earth content under `science.nasa.gov`) · `digital.csic.es` (⚠ AR6 Atlas archive, confirm in M4). `storage.googleapis.com` and `*.amazonaws.com` are already in the Trusted defaults (Hansen raw tiles and Natural Earth live there). Rule: when preflight reports a blocked host, add exactly that host and re-run; do not switch to Full except briefly for debugging.

### 1.6 Setup only you can do (no agent can)

1. Create an empty private GitHub repo and connect it to the cloud environment. 2. Create the environment with network = Custom (§1.5). 3. Setup script: `npx playwright install --with-deps chromium` (⚠ it must finish in about 5 minutes to be cached; otherwise run it from a session-start hook). 4. Connect Cloudflare Pages, Vercel or Netlify to the repo so every branch gets a preview URL (⚠ confirm the chosen host's plan covers branch previews). 5. Optional tokens as environment variables, never in the repo: `CESIUM_ION_TOKEN` (terrain only), `FIRMS_MAP_KEY` (M3, server-side only). 6. DNS for `earth.sumitsuman.com` last.

---

## 2. Audit of the existing page

Measured on the real file on 14 Nov 2026 (✔): `earth.html`, 33,023 bytes, 385 lines, one file. Three.js r128 from a CDN, 3 GLSL programs, **22 coastline polygons with 357 vertices**, **53 hand-placed city-light points**, and zero GSAP, Cesium, ScrollTrigger or network calls.

| Component | Verdict | Reason |
|---|---|---|
| Three r128 UMD from a CDN | **Replace** | Current is r187 (§3); installed from npm as modules. |
| Earth surface: drawn polygons + noise | **Replace** | The core visual failure. Real imagery pipeline (§4.7). Keep nothing. |
| City lights (53 points) | **Replace** | Real night-light imagery. |
| Clouds: procedural noise | **Replace** | A real, date-stamped, satellite-derived cloud map. Keep the *idea* (independent drift, sun-shaded). |
| Atmosphere: Fresnel rim shell | **Replace** | A rim glow is not scattering. Physically based Rayleigh + Mie single scattering driven by the sun and camera altitude. |
| Day/night: terminator smoothstep, twilight tint | **Port the idea** | Rewrite in an Earth-fixed frame with a real solar position (§5.2). |
| Hand-typed data tables | **Discard as data** | Typed from memory; **stale** (ends 2024, while NOAA GML CO₂ and GFW loss now run through 2025). Keep three values only as golden cross-checks for the pipeline. |
| +0.28 °C baseline shift (GISTEMP → 1850–1900) | **Keep, but derive** | Implement in the pipeline with its source, flag it approximate, unit-test it. |
| AR6 scenario numbers typed from memory | **Replace** | Pipeline from AR6 tables; keep the *structure* (id, label, ranges, uncertainty strings). |
| Copy, including "There is no Planet B." | **Keep and rewrite** | The ending stays, and stays wordless otherwise (§6.3, chapter 07). |
| Hash-token URL state | **Replace** | That grammar existed only because of the previous host's limits. Real query parameters (§7.4). |
| 3-tier quality ladder, reduced-motion, keyboard and aria habits | **Port the principles** | Rebuilt properly (§5.5, §8). |
| UI: edge buttons and bottom slider | **Replace entirely** | New identity (§6, §10 M1). |

`legacy/earth.html` is kept read-only for reference and never imported.

---

## 3. Dependencies (exact)

Versions were looked up on 14 Nov 2026. **Pin exactly** (`.npmrc`: `save-exact=true`); preflight also records the registry's latest into `preflight.json` so M0 pins from evidence, not from this table.

| Package | Role | Version | Notes |
|---|---|---|---|
| `three` | Cinematic Earth, GLSL | **0.187.0** (r187, released early Nov 2026) ✔ | Imports `three`, `three/addons/*`; KTX2 loader and Basis transcoder copied to `public/basis/` |
| `@types/three` | Types | ⚠ match the `three` minor | |
| `cesium` | Geographic exploration | **1.147.0** (2 Nov 2026) ✔ | Monthly releases: upgrade only at milestone boundaries. Loaded with a dynamic `import('cesium')` |
| `gsap` | Timelines **and** ScrollTrigger | **3.15.x** ✔ | Free under GreenSock's "no charge" licence, plugins included ✔ (read it once). Imports `gsap`, `gsap/ScrollTrigger` |
| `vite` | Build | **8.x** ✔ (8.0 on 12 Mar 2026) | Needs Node ≥ 20.19 or ≥ 22.12 ✔ |
| `typescript` | Types | ⚠ latest at M0 | |
| `vite-plugin-static-copy` | Copies Cesium's static assets | ⚠ confirm Vite 8 compatibility | Pattern from CesiumGS's official `cesium-vite-example` ✔ |
| `@playwright/test` | Acceptance tests | **1.64.1** (14 Oct 2026) ✔ | Chromium 156 (Chrome for Testing) ✔ |
| `@axe-core/playwright` | Accessibility gate | ⚠ latest at M0 | |
| `sharp` | Build-time mosaics and image processing | ⚠ latest at M0 | Dev only |
| `vitest` | Unit tests (maths, parsers, data) | ⚠ latest at M0 | Dev only |

**Not used, on purpose:** React Three Fiber and drei (two imperative engines; R3F adds a layer and no capability); Lenis or ScrollSmoother (native scroll must stay native); Cesium's default `Viewer` widgets (use `CesiumWidget` and build the interface by hand; keep the Cesium credit visible, as its licence requires); a charting library (legends and the timeline are drawn by hand; add `d3-scale` only if genuinely needed).

**UI layer default: vanilla TypeScript with a tiny observable store, no React.** Reason: the engines are imperative, the interface is small, and ScrollTrigger wants stable DOM. React was your stated preference "where useful"; this is *owner decision D1* (§11).

**WebGPU:** investigate only, as an M6 spike. `WebGLRenderer` + GLSL is the production path, Cesium is WebGL2, and ⚠ Three's `WebGPURenderer` cannot consume raw GLSL `ShaderMaterial` (porting means TSL), so WebGPU would be a rewrite of every shader. Browser support for WebGPU is now broad ✔, so the spike is worth timing, not assuming.

---

## 4. NASA GIBS — sources, layers, coverage, rendering

### 4.1 Service facts (✔ from the GIBS API documentation)

- Base `https://gibs.earthdata.nasa.gov/{wmts|twms|wms}/epsg{4326|3857|3413|3031}/{best|std|nrt|all}/…`. Use **`best`** (one authoritative product per layer id). 3413 and 3031 are the north and south polar stereographic projections.
- REST tile pattern: `…/epsg4326/best/{Layer}/default/{Time}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.{png|jpeg|jpg}`. **Static layers have no `{Time}` segment.** Time is `YYYY-MM-DD` (or `…THH:MM:SSZ` for sub-daily). The WMTS interface requires an *exact* available date; only the WMS interface offers `nearestValue` snapping. **EARTH never snaps silently**: if a date has no imagery, the UI says so.
- Capabilities: `…/epsg4326/best/1.0.0/WMTSCapabilities.xml`. It lists only each layer's **latest 100 time periods**; the full coverage comes from `DescribeDomains`: `…/best/1.0.0/{Layer}/default/{TileMatrixSet}/all/all.xml`, returning ranges such as `2018-05-26/2018-11-03/P1D`.
- Tiles are reprojected on the fly for EPSG:3857 from 4326 sources. No authentication or key; NASA's open-data policy applies. Credit string used in Cesium's own sample: *NASA Global Imagery Browse Services for EOSDIS*.
- Bulk use: roughly 1,000,000 tiles per day requires coordinating with the GIBS team 48 hours ahead (✔). The texture build (§4.7) needs a few hundred tiles; keep it that way, with polite concurrency, and never scrape tiles in tests.

### 4.2 Tiling — the one trap that will cost a day (✔ facts, ⚠ Cesium recipe)

- **EPSG:4326 level 0 is a 2×1 grid of 512-px tiles at 0.5625°/pixel, i.e. each tile spans 288°.** The grid's data window runs from (−180, 90) to (396, −198), so it extends beyond the world (⚠ derived, to be checked against the live capabilities: the advertised matrix sizes are trimmed to the world, i.e. 2×1, 3×2, 5×3, 10×5, 20×10 …). Highest level per resolution (geographic): 2 km → 5, 1 km → 6, 500 m → 7, 250 m → 8, 125 m → 9, 62.5 m → 10, 31.25 m → 11, 15.625 m → 12. Web Mercator uses `GoogleMapsCompatible_Level6…13` and the stock Web Mercator scheme.
- Cesium's default geographic scheme (level-0 tile = 180°) **will not align** with this (derived: 180/2ⁿ never equals 288/2ᵏ). Candidate: `new Cesium.GeographicTilingScheme({ rectangle: Cesium.Rectangle.fromDegrees(-180, -198, 396, 90), numberOfLevelZeroTilesX: 2, numberOfLevelZeroTilesY: 1 })`, with `tileWidth/tileHeight: 512` and `maximumLevel` per matrix set. ⚠ This is derived from the published tile-matrix geometry; the official GIBS Cesium example says to use a GIBS-specific `GeographicTilingScheme` but I could not read its exact parameters.
- **M0 spike (blocking):** (a) a unit test comparing tile bounds computed by that Cesium scheme with the `TopLeftCorner`, `MatrixWidth`, `MatrixHeight`, `ScaleDenominator` from the live capabilities for levels 0–8; (b) a visual alignment test of three known tiles against Natural Earth coastlines; (c) the same for EPSG:3857 with the default Web Mercator scheme. Choose per use: **3857** is simplest but ends at ±85.05° (no poles) and is reprojected; **4326** is needed for polar chapters. Record the decision in `docs/DECISIONS.md`.

### 4.3 Layer catalog (candidates, to be confirmed by `scripts/gibs-catalog.mjs`)

The GIBS "available visualizations" catalog is loaded dynamically, so I could not read it; ids below come from documentation examples and client listings. **Any id the M0 script does not find is dropped or replaced via its discovery output, never guessed.**

| Role | Candidate layer id | Status | Use |
|---|---|---|---|
| Base day surface | `BlueMarble_ShadedRelief_Bathymetry` (500 m, JPEG, static) | ✔ id seen in live client code | Three texture mosaic; Cesium base layer |
| Alternative base | `BlueMarble_NextGeneration` (monthly) | ✔ id seen | Seasonal option |
| Dated true colour | `MODIS_Terra_CorrectedReflectance_TrueColor` (250 m, JPEG, daily) | ✔ id and example date in docs; ⚠ start date (expected 2000) | Time machine imagery; cloud map source |
| Dated true colour | `MODIS_Aqua_…`, `VIIRS_SNPP_…`, `VIIRS_NOAA20_…` `_CorrectedReflectance_TrueColor` | ⚠ | Gap filling, later years |
| Night lights | `VIIRS_Black_Marble`, `BlackMarble_2016`, `VIIRS_SNPP_DayNightBand_ENCC` | ⚠ ids unverified | Fallback: NASA "Black Marble" product from NASA's image library (public domain) |
| Sea-surface temperature | `GHRSST_L4_MUR_Sea_Surface_Temperature` (1 km, daily) | ✔ id seen in a client listing; dataset covers 2002–present ✔; ⚠ GIBS start date | Ocean layer |
| Sea ice (daily) | `AMSR2_Sea_Ice_Concentration_12km` / `AMSRU2_…`, `MODIS_Terra_Sea_Ice` | ⚠ AMSR2 id unverified; ✔ `MODIS_Terra_Sea_Ice` seen | Polar chapter |
| Fires | `VIIRS_NOAA20_Thermal_Anomalies_375m_All`, `…NOAA21…`, `…SNPP…`, `MODIS_Terra_Thermal_Anomalies_All` | ⚠ best-endpoint ids; ✔ versioned NRT variants exist | Fire layer (see §7.5 on sensor choice) |
| Vegetation context | `MODIS_Terra_NDVI_8Day`, `MODIS_Terra_EVI_8Day` | ✔ ids seen | Forest chapter backdrop (**greenness, not forest loss**) |
| Cloud fraction | `MODIS_Terra_Cloud_Fraction_Day` (2 km, PNG) | ✔ id in docs | Optional data view only |
| Atmospheric CO₂ | none identified | ✘ not found; `MOPITT_CO_*` is carbon **monoxide** | Use NOAA GML series; discovery regex in the script may find a GIBS layer |
| Temperature anomaly | none in GIBS | ✘ | GISTEMP gridded (§7.5) |

### 4.4 What the dates can support

GIBS true-colour imagery starts around 2000 (⚠ confirm), SST in 2002, daily sea ice later still. **There is no dated satellite imagery before 2000.** The timeline therefore carries *different data in different eras*: gridded GISTEMP back to 1880, NOAA/Law Dome CO₂, NSIDC sea ice from 1978, dated imagery from ~2000, and projections after the present. The timeline UI must show, for the selected date: the dataset, its temporal resolution, its coverage window, and whether it is **observed**, **model-derived** or **projection**. A crossfade between two dates is a *visual transition* and is labelled "transition (not data)"; **no interpolated value is ever labelled a measurement.**

### 4.5 Rendering in Cesium (✔ pattern from Cesium's own GIBS time-dynamic example)

```ts
const times = Cesium.TimeIntervalCollection.fromIso8601({ iso8601: '2000-02-24/2026-11-13/P1D', dataCallback: (i, idx) => ({ Time: i.start.toString().slice(0, 10) }) });
const provider = new Cesium.WebMapTileServiceImageryProvider({
  url: 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{Time}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg',
  layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', style: 'default', format: 'image/jpeg',
  tileMatrixSetID: '250m', maximumLevel: 8, tileWidth: 512, tileHeight: 512,
  tilingScheme: gibs4326Scheme, // §4.2, after the M0 spike
  clock: widget.clock, times,
  credit: 'NASA Global Imagery Browse Services for EOSDIS',
});
```
Build `times` from `DescribeDomains`, never from guessed ranges. One imagery layer per dataset; split-screen compare uses `ImageryLayer.splitDirection`.

### 4.6 Rendering in Three

Three never streams tiles. It shows **pre-built, compressed global textures** produced at build time (§4.7), with provenance in the manifest.

### 4.7 Texture pipeline (`scripts/textures/`, run in M1)

1. Fetch the tile range covering −180…180 / 90…−90 at 4326 level 4 for `BlueMarble_ShadedRelief_Bathymetry` (20×10 tiles of 512 px = 10,240×5,120 px; about 200 requests). 2. Stitch with `sharp`, crop to the world, resample to equirectangular 8192×4096. 3. Encode to **KTX2/Basis** at 8k, 4k, 2k tiers (KTX-Software `toktx` from a GitHub release, or `basisu`); also a 1k JPEG that is inlined for the first paint. 4. Same for night lights and for the cloud map. 5. Write `public/data/manifest.json`: per texture `{id, source, layer, date, retrievedAt, license, attribution, sha256, bytes}`. AC-03 enforces this.

**Clouds (owner decision D4):** build a cloud alpha map from a *date-stamped composite* of daily MODIS Terra + Aqua true-colour mosaics (max-compositing a few days to fill swath gaps, differencing against the cloud-free base). It is real satellite data and is labelled "clouds: composite of MODIS imagery, <dates>"; its slow drift is stated as presentation. Fallback: a public-domain NASA cloud composite with licence evidence. Procedural cloud noise is **not** an acceptable fallback (your rule).

---

## 5. Three ↔ Cesium without doubling the GPU bill

### 5.1 Principle
**Exactly one WebGL renderer draws at any moment.** Two canvases exist; the inactive one is paused or released. The only time both draw is a crossfade of at most ~600 ms (AC-06 measures this).

```
OPENING (three)  --altitude < H_in-->  PREHEAT (cesium draws hidden, 1–2 frames, tiles requested)
   ^                                        |  crossfade ≤ 600 ms (both alive)
   | altitude > H_out                       v
   +------------ CROSSFADE <--------- EXPLORE (cesium; three paused or released)
```
`H_in ≈ 4,000 km`, `H_out ≈ 5,500 km` (hysteresis) are starting values ⚠, tuned at M2 so that Three's 8k texture and Cesium's first tiles look alike at the swap.

### 5.2 Shared state: sky and camera

- **Earth-fixed frame everywhere (ECEF).** The Earth never rotates in either scene; *time* does. `SkyState { utc, sunDirEcef }` is the single source of lighting for both engines. Auto-rotation = advancing simulated UTC (e.g. 600× real time) with the camera in `sunRelative` frame in the opening, `earthFixed` in the story and in explore mode.
- Sun direction from the Astronomical Almanac low-precision formulas (accurate to ~0.01°): with `n` = days since J2000, `L = 280.460 + 0.9856474 n`, `g = 357.528 + 0.9856003 n`, `λ = L + 1.915 sin g + 0.020 sin 2g`, `ε = 23.439 − 4e-7 n`, declination `δ = asin(sin ε sin λ)`, right ascension `α = atan2(cos ε sin λ, cos λ)`, `GMST = 280.46061837 + 360.98564736629 n`; subsolar longitude `α − GMST`; `sunDirEcef = (cos δ cos Λ, cos δ sin Λ, sin δ)`. A vitest compares it with Cesium's own sun for 20 random dates (< 0.1°). For Cesium simply set `clock.currentTime` from `utc`.
- **CameraRig** (plain object, the only thing ScrollTrigger touches): `{ lon, lat, alt, heading, pitch, roll, fovV }`, degrees and metres above the WGS84 ellipsoid.

### 5.3 The maths that makes the handoff seamless

```ts
const A = 6378137, F = 1 / 298.257223563, E2 = F * (2 - F);
export const geodeticToEcef = (lonD: number, latD: number, h: number): [number, number, number] => {
  const l = lonD * Math.PI / 180, p = latD * Math.PI / 180, s = Math.sin(p), c = Math.cos(p), N = A / Math.sqrt(1 - E2 * s * s);
  return [(N + h) * c * Math.cos(l), (N + h) * c * Math.sin(l), (N * (1 - E2) + h) * s];
};
// local east/north/up at (lon,lat)
const enu = (l: number, p: number) => ({ e: [-Math.sin(l), Math.cos(l), 0], n: [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)], u: [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)] });
// view direction for heading h (clockwise from north) and pitch p (negative = looking down):
//   f = e·sin h·cos p + n·cos h·cos p + u·sin p        up = −e·sin h·sin p − n·cos h·sin p + u·cos p   (roll 0)
// ECEF → Three axes (a pure rotation, handedness preserved):  (x, y, z) → (x, z, −y), divided by A.
```
- **Field of view.** Cesium's `frustum.fov` is the *horizontal* angle when the canvas is wider than tall (vertical otherwise). Convert for Three: `fovV = 2·atan(tan(fovH/2)/aspect)` when `aspect ≥ 1`.
- **Geometry.** Build the Earth mesh by parameterising **geodetic** `(lon, lat)` through `geodeticToEcef(…, 0)` with UV `((lon+180)/360, (lat+90)/180)` and the geodetic normal as the vertex normal. A scaled sphere would misplace coastlines by up to ~21 km (≈ 2 px at handoff altitude) against Cesium's ellipsoid.
- Unit tests (vitest): `rigToThree(rig)` and `rigToCesium(rig)` must agree on the projected position of three known points (e.g. the subsolar point, Lake Victoria, the Strait of Gibraltar) within 1 px at 1440×900 for 8 rigs.

### 5.4 Handoff algorithm

1. **Idle after first frame:** fetch the Cesium chunk and construct `CesiumWidget` hidden (`opacity 0`, not rendering, `requestRenderMode = true`, `useDefaultRenderLoop = false`). It does not exist on the critical path (AC-15).
2. **Preheat** when altitude crosses `H_in`: set Cesium to the current rig, render 1–2 frames hidden so base tiles are requested and decoded.
3. **Crossfade** ≤ 600 ms: opacities animate so `opacity.three + opacity.cesium ≥ 0.9` at every instant (no black flash).
4. **Pause Three:** `setAnimationLoop(null)`, canvas `display: none`. On the PERFORMANCE tier also `release()`: dispose textures and geometry and `forceContextLoss()`. Reverse transition rebuilds from the 1k placeholder and streams the better tiers.
5. Cesium inputs are enabled only in explore mode (§6.2).

### 5.5 Quality tiers (starting values; tuned at M6)

| | HIGH | BALANCED | PERFORMANCE |
|---|---|---|---|
| Day/night/cloud textures | 8k / 8k / 4k | 4k / 4k / 2k | 2k / 2k / 2k |
| Device-pixel-ratio cap | 2 | 1.5 | 1 |
| Anti-aliasing | MSAA 4× | FXAA or none | none |
| Atmosphere ray-march samples (view/light) | 16 / 8 | 12 / 6 | 8 / 4 |
| Cesium `resolutionScale` / `maximumScreenSpaceError` | 1 / 2 | 1 / 4 | 0.75 / 8 |

Detection is conservative: touch + small screen or `deviceMemory ≤ 4` or `hardwareConcurrency ≤ 4` starts at PERFORMANCE; otherwise BALANCED; HIGH only on a desktop-class device with a measured frame-time margin. A frame-time EMA drops one tier after 2 s over budget (with hysteresis), `?q=high|balanced|performance` and a manual control override it, and `prefers-reduced-motion` disables auto-rotation and replaces camera flights with ≤ 250 ms cuts.

### 5.6 Look development for M1 ("photorealistic" has a recipe)

Real base (Blue Marble shaded relief + bathymetry), real night lights, a real cloud composite; **physically based single-scattering atmosphere** (Rayleigh + Mie phase functions, sun- and altitude-dependent limb, thin ozone tint at the terminator); ocean as Fresnel reflection with sun glint from a land/sea mask (Natural Earth, public domain), no fake waves; filmic tone mapping with fixed exposure; **bloom only on city lights and sun glint** (your "don't make everything glow"); real star positions (a public star catalogue or NASA's deep star map ⚠ confirm licence) oriented ICRF→ECEF with GMST so constellations are where they should be at the displayed UTC. **Calibration:** ⚠ compare a render for the same UTC against DSCOVR-EPIC natural-colour imagery (NASA EPIC API; confirm access in M0) in the M1 review pack; it is evidence for a human, not an automated test.

### 5.7 Failure handling
Cesium chunk or tile failure → stay in Three, clamp the minimum altitude, show a quiet notice; WebGL context loss → rebuild the active stage; memory pressure (mobile) → `release()` the inactive stage; no WebGL at all → semantic HTML fallback with the datasets as tables (AC-04).

---

## 6. GSAP + ScrollTrigger storytelling

### 6.1 Layers
`Story DOM (semantic sections with data-cam-* attributes)` → `ScrollTrigger scenes` → `CameraRig + layer mix (plain objects)` → `Stage adapters (Three | Cesium)`. Engines read the rig in **their own** animation loop. ScrollTrigger never calls into an engine, which keeps scrubbing smooth and makes the handoff invisible to the story code.

### 6.2 Two modes, one owner of input
- **Story mode (default):** the page scrolls natively. Canvases are `pointer-events: none`, Cesium inputs disabled, and **no event is ever `preventDefault()`ed** (AC-11 checks). Camera follows the scrub.
- **Explore mode:** an explicit "Explore freely" control freezes scroll (`overflow: hidden`) and gives Cesium or Three the pointer. Leaving eases the camera back to the current chapter's pose.
- Rules: `ScrollTrigger.config({ ignoreMobileResize: true })`; no `normalizeScroll`; wrap everything in `gsap.matchMedia()` with a reduced-motion branch (cuts, no scrubbed flights); call `ScrollTrigger.refresh()` after fonts load; at most two scrubs active at once; **pin only chapters 02 and 06**.

### 6.3 Chapters (camera targets are proposals; they live in the HTML as `data-cam-lon/lat/alt` and tests read them from there)

| # | id | Title | Scroll | Pin | Camera (lon, lat, alt) | Engine | Data on screen | Layout idea |
|---|---|---|---|---|---|---|---|---|
| 01 | `living-planet` | The Living Planet | 120 vh | no | 20, 15, 14,000 km | Three | none | Asymmetric title block off the planet; small coordinates and UTC readout |
| 02 | `warming-world` | A Warming World | 400 vh | **yes** | 20, 15, 9,000 km | Three | GISTEMP gridded frames 1880→latest, baseline stated | Time scrubs *annual frames* (snapped, never interpolated); thin ruler timeline |
| 03 | `vanishing-green` | The Vanishing Green | 250 vh | no | −62, −5, 1,800 km | Cesium | GFW tree-cover loss over true colour | Marginalia annotations pinned to coordinates |
| 04 | `under-the-ocean` | Under the Ocean | 250 vh | no | −140, 0, 6,000 km | Cesium | GHRSST MUR sea-surface temperature | Colour ramp with units; one dated sentence |
| 05 | `frozen-frontier` | The Frozen Frontier | 250 vh | no | 0, 85, 5,000 km (polar view) | Cesium | NSIDC September extent 1979 vs latest; AMSR2 daily | Curtain compare (`splitDirection`) |
| 06 | `future` | The Future | 400 vh | **yes** | 20, 15, 12,000 km | Cesium/Three | Three AR6 pathways, projection badge | Side-by-side pathways, ranges shown, sources one click away |
| 07 | `choice` | A Choice | 150 vh | no | 20, 15, 14,000 km | **Three** (reverse handoff) | none | No UI. Earth quietly rotating; then **"There is no Planet B."** and *"The future is still ours to shape."* |

Navigation: a thin chapter rail (keyboard reachable) jumps with smooth native scrolling; every chapter has a deep link `?c=<id>`.

### 6.4 Interpolation rules
Interpolate **altitude in log space**, position by **great-circle (slerp of unit vectors)**, heading by shortest angle. Time never interpolates: scroll progress maps to the dataset's discrete frames. Easing is for camera feel only.

### 6.5 Sketch
```ts
gsap.registerPlugin(ScrollTrigger);
export const rig = { lon: 20, lat: 15, alt: 14e6, heading: 0, pitch: -90, roll: 0, fovV: 35 };
for (const el of document.querySelectorAll<HTMLElement>('[data-chapter]')) {
  const to = { lon: +el.dataset.camLon!, lat: +el.dataset.camLat!, alt: +el.dataset.camAlt! };
  gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 20%', scrub: 0.6, pin: el.hasAttribute('data-pin') } })
      .to(rig, { ...cameraTween(rig, to) }, 0)       // slerp + log-altitude, see §6.4
      .to(layerMix, { /* per-chapter layer opacities */ }, 0);
}
```

---

## 7. Application architecture

### 7.1 Repository
```
earth/
  docs/  KICKOFF.md  STATUS.md  DECISIONS.md  reports/  evidence/
  legacy/earth.html                       (read-only reference)
  scripts/  preflight.mjs  gibs-catalog.mjs  lib/http.mjs  textures/  data/      (build-time ingestion)
  server/   functions/                    (serverless: FIRMS cache/proxy; keys live here only)
  public/   basis/  textures/{1k,2k,4k,8k}/  data/manifest.json  data/ar6/summary.json  og/
  src/
    main.ts  app/{orchestrator,state,deeplink,quality,test-hooks}.ts
    render/shared/{rig,ecef,sky,quality}.ts
    render/three/{EarthStage,earth.vert,earth.frag,atmosphere.frag,clouds.frag,stars}.ts
    render/cesium/{CesiumStage,gibs,picking,overlays}.ts
    data/{providers,processors,normalizers,types,registry}/          (no UI imports)
    layers/{temperature,fires,forestLoss,sst,seaIce,co2}.ts          (LayerDef each)
    story/{chapters.ts,scenes.ts,nav.ts}
    ui/{timeline,legend,infopanel,share,chapter-rail,fallback}.ts
    styles/
  tests/  helpers.ts  harness.spec.ts  acceptance.spec.ts
  playwright.config.ts  vite.config.ts  tsconfig.json  package.json
```

### 7.2 Contracts
```ts
export interface Stage { id: 'three' | 'cesium'; init(): Promise<void>; setRig(r: CameraRig): void; setSky(s: SkyState): void;
  setLayers(l: LayerState[]): void; resume(): void; pause(): void; release(): void; readonly rendering: boolean; pick(x: number, y: number): GeoPick | null }
export interface LayerDef { id: string; title: string; kind: 'imagery' | 'gridded' | 'points' | 'series';
  legend: { units: string; baseline?: string; ramp: Stop[]; ticks: number[] };
  temporal: { type: 'static' | 'daily' | 'monthly' | 'annual' | 'projection'; coverage: () => Promise<{ first: string; last: string; dates?: string[] }> };
  provenance: { dataset: string; url: string; license: string; attribution: string; kind: 'observed' | 'projection' | 'illustrative' };
  availability(): Promise<{ ok: boolean; lastObservation?: string; reason?: string }>;
  mount(stage: Stage, t: TimeSel, signal: AbortSignal): Disposable }
```
A layer is shown only if `availability()` says `ok`; otherwise the UI shows *"temporarily unavailable — last observation <date>"* (AC-08). The data layer imports nothing from `ui/` or `render/`.

### 7.3 Data flow
`provider (retrieve)` → `processor (reduce, regrid, encode)` → `normalizer (typed Dataset + units + baseline + provenance)` → `layer (visualise)` → `ui`. Heavy datasets are processed **at build time** into static assets under `public/data/` (so the site never depends on a third-party API being up), with `manifest.json` recording source, version, retrieval time, coverage, licence, attribution and checksum. Live-ish data (fires) is fetched by a scheduled job into your own static JSON with an "as of" timestamp. The Sources panel and attribution strings are **generated from the manifest**, never retyped.

### 7.4 Deep links (real query parameters on your own domain)
`/?c=<chapter>&view=three|cesium&lat=…&lon=…&alt=…&h=…&p=…&l=<layer[,layer]>&d=<YYYY-MM-DD>&s=<ssp119|ssp245|ssp585>&cmp=<d1..d2|s1..s2>`. `shareUrl()` serialises exactly this. Share image (M5): composed client-side from a canvas capture + legend + source line + date + URL, with an optional second pathway for comparisons; per-link dynamic Open Graph cards are an M6 stretch (needs a serverless function); the default static OG image and all metadata ship in M5 (AC-13).

### 7.5 Datasets

| Dataset | Source and format | Coverage / resolution | Processing | Licence / citation | Milestone |
|---|---|---|---|---|---|
| Surface, night, clouds | NASA GIBS mosaics (§4.7) | static / dated | KTX2 | NASA open data; credit GIBS | M1 |
| Dated imagery | GIBS WMTS, runtime | ~2000→ daily | none | NASA open data | M2/M4 |
| Temperature anomaly | NASA GISS **GISTEMP v4** gridded netCDF ✔ (2°×2°, monthly, 1880→present, vs 1951–1980, variable `tempanomaly`); page `data.giss.nasa.gov/gistemp/` | annual frames | regrid to equirect PNG/float16 per year; add the documented baseline shift to 1850–1900 only in a *labelled* secondary view | NASA/GISS (cite Lenssen et al. 2019) | M3/M4 |
| CO₂ | **NOAA GML** Mauna Loa annual and monthly CSV ✔ (`gml.noaa.gov/webdata/ccgg/trends/co2/co2_annmean_mlo.csv`, `co2_mm_mlo.csv`), through 2025 annual ✔; pre-1958 from Law Dome ice cores (⚠ pick the NOAA/CSIRO distribution, cite it) | 1958→ / 1900→ | series + station marker | NOAA GML citation as requested on the data page | M3 |
| Sea ice | **NSIDC Sea Ice Index v4 (G02135)** ✔, daily from 1978-10-26, `noaadata.apps.nsidc.org/NOAA/G02135/`; monthly extent CSV and concentration GeoTIFFs (⚠ confirm exact paths by directory listing) | 1978→ | September 1979 vs latest frames | US Government works; cite Fetterer et al., DOI 10.7265/a98x-0f50 ✔ | M3 |
| Sea-surface temperature | GIBS `GHRSST_L4_MUR…` | 2002→ daily, 1 km | none | NASA open data (PO.DAAC MUR) | M3 |
| Fires | **FIRMS** ✔: area API `…/api/area/csv/{MAP_KEY}/{SOURCE}/{area}/{days}[/{date}]`, free key, **5,000 transactions per 10 minutes**, key sits in the URL path ⇒ **proxy server-side only**. A **keyless** option exists ✔: regional 24 h/48 h/7 d CSVs under `…/data/active_fire/<sensor>/csv/`. Plan: scheduled job → your static JSON | near-real-time | compact binary of lon, lat, FRP, acquisition time | NASA open data; cite FIRMS | M3 |
| Fire sensor choice | ⚠ A third-party note (checked 17 Oct 2026) cites a FIRMS news item that some products **cease on 2026-11-01**; prefer NOAA-20/NOAA-21 VIIRS. Verify on FIRMS's news page and with the API's availability endpoint in M0 | | | | |
| Forest loss | **UMD/Hansen tree-cover loss via Global Forest Watch** ✔: dataset `umd_tree_cover_loss`, CC BY 4.0, annual 30 m, editions through 2025 (⚠ v1.13); tile endpoint pattern `tiles.globalforestwatch.org/umd_tree_cover_loss/latest/dynamic/{z}/{x}/{y}.png` with year and canopy-threshold query parameters (⚠ confirm parameters, encoding and CORS in the M3 spike; decode in a GLSL shader if the PNG encodes year in colour channels) | 2001→2025 | optional pre-aggregation by country for the comparison panel | CC BY 4.0; cite Hansen et al. 2013 | M3 |
| Future (global) | **IPCC AR6 WGI** SSP1-1.9, SSP2-4.5, SSP5-8.5 tables | 2021–2040, 2041–2060, 2081–2100 | JSON with medians and very likely/likely ranges, baselines recorded | IPCC citation | M4 |
| Future (regional pattern) | **AR6 Interactive Atlas gridded CMIP6** (IPCC-DDC / DIGITAL.CSIC archive, replicated on the Copernicus CDS; the CDS needs a free account and API key) ✔ | monthly grids | decadal regional change per scenario | per archive | M4 |
| Sea level projections | ⚠ AR6 sea-level data (e.g. NASA's AR6 projection tool distribution); pick and document in M4 | 2020–2150 | global and coastal summaries | per distributor | M4 |
| Land/sea mask | Natural Earth (public domain) | static | rasterise | public domain | M1 |

⚠ **Owner decision D3:** the Atlas README lists gridded SSP1-2.6, SSP2-4.5 and SSP5-8.5 (not SSP1-1.9). For SSP1-1.9 either (a) show the SSP1-2.6 grid with SSP1-1.9 *global* numbers and say so, or (b) a clearly labelled pattern-scaled field (CMIP6 warming-level patterns × AR6 global change). The brief's default is (b), labelled "pattern-scaled, model-based".

### 7.6 Budgets (enforced by AC-15)
Initial JS ≤ 450 KB compressed with Cesium **absent**; Cesium lazily loaded; 2k tier textures total ≤ 12 MB; ≤ 12 draw calls in the global view; first frame budget is measured, not assumed.

### 7.7 Hosting
Static site on a Git-integrated host with **branch previews** (Cloudflare Pages, Vercel or Netlify ⚠ confirm plan limits) plus serverless functions for the FIRMS job. Production on `earth.sumitsuman.com`. A human reviews every milestone on the preview URL on a real GPU before the owner signs off.

---

## 8. Playwright acceptance

### 8.1 Strategy
Two projects, **both** must pass: `desktop` (1440×900) and `mobile` (Pixel 7 emulation). Software WebGL2 via SwiftShader (`playwright.config.ts` carries the flags); `workers: 1`; the app is loaded with `?test=1&q=performance`. Tests assert **state, requests and pixels**, never frame rate. They run against `npm run preview`, or `EARTH_BASE_URL=<preview URL>`.

### 8.2 Contracts the app must honour
- `window.__EARTH__` exists only with `?test=1` and implements `EarthTestApi` in `tests/helpers.ts` (stage state incl. frames, opacities, programs and shader errors; rig; layers; date; scenario; story; motion; share URL). Tests never stub data.
- `data-testid`s: `skip-link`, `nogl-fallback`, `chapter-text`, `dataset-table`, `legend`, `legend-units`, `source-link`, `observation-date`, `kind-badge` (`data-kind="observed|projection|illustrative"`), `coverage-note`, `layer-unavailable`, `scenario-readout`.
- Each `[data-chapter="<id>"]` carries `data-cam-lon`, `data-cam-lat`, `data-cam-alt`.
- `public/data/ar6/summary.json`: `{ scenarios: { ssp119|ssp245|ssp585: { label, baseline, gsat_2081_2100: {median, low, high}, slr_2100: {median, low, high} } } }`, generated by the pipeline; the UI and AC-10 read the same file.

### 8.3 Catalogue

| ID | Milestone | Proves | Evidence |
|---|---|---|---|
| H-01…H-05 | M0 | The instruments work: WebGL2, pixel statistics, console gate, touch input, evidence capture | pass log, probe screenshot |
| AC-01 | M1 | Opening scene is a non-flat globe filling the frame, loop advancing, Cesium idle | screenshot |
| AC-02 | M1 | ≥ 3 GLSL programs (atmosphere, surface, clouds), 0 shader errors, ≤ 12 draw calls | stage JSON |
| AC-03 | M1 | KTX2 textures requested; manifest provenance complete | `AC-03-texture-provenance.json` |
| AC-04 | M1 | No-WebGL fallback readable | — |
| AC-05 | M2 | Cesium on WGS84 shows real GIBS tiles (> 8 images, status 200) | `AC-05-gibs-requests.json`, screenshot |
| AC-06 | M2 | Never two renderers beyond ~1 s; no black flash; Three stops rendering; reverse handoff works | screenshot |
| AC-07 ×6 | M3 | Each layer visibly changes the globe and shows units, date, source link, kind badge; GIBS miss rate < 5 % | screenshots |
| AC-08 | M3 | A failed dataset is "unavailable" with last observation, never faked | screenshot |
| AC-09 | M4 | Timeline requests exact dated tiles; different dates look different; "no imagery" stated before coverage | screenshot |
| AC-10 ×3 | M4 | Scenarios are labelled projections and display the AR6 numbers from the data file | screenshots |
| AC-11 | M5 | Real wheel scrolling moves the camera through all seven chapters to their declared targets; ≥ 3 scrubbed scenes; no scroll-jacking; ends on global Three | seven screenshots |
| AC-12 | M5 | Share link restores layer, date, camera in a fresh context | screenshot |
| AC-13 | M5 | Open Graph, Twitter, theme-colour, canonical present; OG image is real and ≥ 1200×630 | — |
| AC-14 | M6 | No horizontal overflow, tap targets ≥ 44 px (mobile), drag or touch rotates | screenshot |
| AC-15 | M6 | Cesium absent at first load; JS budget; first-frame time; CLS < 0.1 | `AC-15-budgets.json` |
| AC-16 | M6 | axe: no critical or serious; skip link; focus visible; reduced motion honoured | — |

Scripts to add: `"accept:M0": "playwright test --grep \"@M0\\b\""`, and likewise `accept:M1` … `accept:M6` with `--grep "@M[0-n]\\b"`; `"report:M1"` etc. generate the milestone report skeleton (§9).

### 8.4 What Playwright cannot prove
Frame rate, the real-GPU look, and Safari/iOS behaviour. These are **human gates** on the preview URL: the app has a `?perf=1` overlay (frame-time p50/p95, draw calls, texture memory) and the owner pastes numbers into `docs/reports/M6-realgpu.md` (ledger R13). Mobile Safari is checked manually on a real iPhone.

### 8.5 Thresholds
Numbers in the specs (pixel structure, diffs, budgets) are starting values. Tuning one requires a line in `docs/CHANGELOG-ACCEPTANCE.md` explaining why; deleting an assertion does not.

### 8.6 What has actually been executed (14 Nov 2026, in the chat sandbox)
✔ `scripts/preflight.mjs` ran end to end and produced `BLOCKED` with evidence; running it exposed one real bug (a self-deadlock in the local-server check), now fixed. ✔ `scripts/gibs-catalog.mjs --selftest` passes on synthetic XML; running the live path exposed that it wrote an empty evidence file when offline, now fixed to fail cleanly with no file. ✔ Both spec files parse and list **56 tests** (28 per project) under Playwright 1.63.0. ✔ The 5 harness tests ran in real headless Chromium: **9 passed, 1 skipped by design** (touch test on the desktop project); the run caught one bug in my stub page. ✔ `tsc --noEmit` is clean with stubs for `@types/node` and `@axe-core/playwright`, which could not be installed offline. ✘ **No acceptance test (AC-xx) has ever run against an app, and no GIBS, GISTEMP, NOAA, NSIDC, FIRMS, GFW or AR6 request was made by me.** Expect AC-xx to be RED until built.

---

## 9. Evidence and completion reports

- **Layout:** `docs/evidence/<M#>/<project>/<test-id>.png|json`, `docs/evidence/playwright-report/` (HTML), `docs/evidence/results.json`, `docs/evidence/M0/{preflight.json,gibs-catalog.json}`, GIBS request ledgers per test, traces for failures.
- **Ledger:** `docs/STATUS.md` rules apply. The agent edits it in the same commit as the work.
- **Per-milestone report** (`docs/reports/M#.md`, from `docs/reports/TEMPLATE.md`) contains your eight items: (1) files created/modified, (2) dependencies installed (from the lockfile), (3) where CesiumJS is used, (4) where Three.js and GLSL are used, (5) where GSAP and ScrollTrigger are used, (6) real datasets integrated (copied from the manifest), (7) interactions that passed browser testing (test id, project, evidence), (8) what is incomplete; plus deviations and an evidence index.
- **Gate:** a milestone is GREEN only if `npm run accept:M#` exits 0 on both projects, the ledger rows are PASS, the report exists, and a preview URL has been given to the owner. Then the agent stops.
- **Human review pack** per milestone: desktop and mobile screenshots, the preview URL, a 6-line checklist for the owner (does it look like our planet; is anything fake; is every number sourced).

---

## 10. Milestones

| M | Scope | Exit criteria | Not in scope |
|---|---|---|---|
| **M0** Foundation and gates | Run preflight; scaffold Vite + TS; `.npmrc` exact pins; install §3; CI script; test hooks stub; GIBS catalog snapshot; the §4.2 tiling spike with a decision; texture-pipeline proof for one tier; preview deploy of a hello page | R0, R0b, R0c GREEN; `DECISIONS.md` has D1–D8 resolved or escalated | Any visible design |
| **M1** Cinematic Earth | Real textures (KTX2, provenance), physically based atmosphere, clouds, night side, stars, opening composition, quality tiers, fallback | R1, R2, R2b; owner review of the opening against reference imagery | Cesium |
| **M2** Geographic engine and handoff | Lazy Cesium, GIBS base layer, chosen tiling scheme, pick and fly-to, orchestrator, handoff | R3, R4 (partial); AC-05, AC-06 | Data layers |
| **M3** Layers | Temperature, fires, forest loss, SST, sea ice, CO₂ with legends, units, dates, sources, unavailable states | R9 | Time machine |
| **M4** Time machine and futures | Timeline UI with era-aware coverage; dated imagery; gridded history; AR6 scenarios and compare | R8, R10, R4 | Story |
| **M5** Story and sharing | Seven chapters, ScrollTrigger scenes, rail, deep links, share image, social metadata, the ending | R5, R6, R11 | Polish |
| **M6** Polish | Mobile, performance (real-GPU human gate), accessibility, WebGPU spike, final QA | R7, R12, R13 | New features |

---

## 11. Open decisions and risks

| # | Decision (owner unless stated) | Default if not answered |
|---|---|---|
| D1 | UI layer: vanilla TS vs React | Vanilla TS |
| D2 | GIBS projection per use: 4326 custom scheme vs 3857 | Decided by the M0 spike |
| D3 | SSP1-1.9 regional grids (§7.5) | Pattern-scaled, labelled |
| D4 | Cloud texture source (§4.7) | MODIS composite, date-stamped |
| D5 | Terrain: Cesium ion token or none | None until M3 needs it |
| D6 | FIRMS sensors given the possible product cessation | NOAA-20/NOAA-21 VIIRS, verified in M0 |
| D7 | Preview host (Cloudflare Pages / Vercel / Netlify) | Whichever the owner already has |
| D8 | Serverless host for the FIRMS job | Same vendor as D7 |

**Risks.** Cesium's size and memory on phones (mitigation: lazy, release, PERFORMANCE default). Software-GL test speed (mitigation: `workers: 1`, `?q=performance`, background runs, long timeouts). GIBS availability or rate limits (mitigation: build-time textures, small request counts, graceful states). Texture and star-map licences (mitigation: manifest with licence evidence before use). First-frame time (budgeted and measured). The brief's ⚠ items: each must be closed with evidence or recorded as a deviation.

---

## Appendix A — first message to the agent

> Read `docs/KICKOFF.md` completely. Run `node scripts/preflight.mjs`. If it prints BLOCKED, stop and write `docs/reports/M0-blocked.md`; do not scaffold. If READY, execute **M0 only**: follow §10, keep `docs/STATUS.md` honest, run `npm run accept:M0`, write `docs/reports/M0.md`, push a branch, give me the preview URL and stop. Do not start M1. Never mark anything done without test evidence in the repo.

---

## Addendum A — GitHub-only workflow (decided 15 Nov 2026)

The owner chose **GitHub Actions + GitHub Pages** instead of a separate cloud IDE. This is a fifth environment option and it satisfies §1.3: the Actions runner has internet, npm, a persistent repo, installable Playwright/Chromium with software WebGL2, and the live Pages URL is the human preview. What changes versus §1.4 is the **feedback loop**: there is no agent inside the VM, so each run's evidence summary (`scripts/ci-summary.mjs`, on the run page) and the `m0-evidence` artifact are pasted back to Claude, who writes the next change set. Milestone gates, the ledger and the evidence rules are unchanged. `scripts/preflight.mjs` runs in CI with `--skip repo.remote_write,repo.persistence` (checks that only apply to an agent VM). EARTH lives in its **own repo** with the custom domain set in Settings → Pages (Actions deploys ignore a `CNAME` file). See `docs/RUNBOOK.md`.

## Appendix B — package contents and where they go

`README.md`, `package.json`, `.npmrc`, `.gitignore`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/`, `.github/workflows/{ci,deploy}.yml`, `scripts/ci-summary.mjs`, `docs/RUNBOOK.md`, `docs/KICKOFF.md`, `docs/STATUS.md`, `docs/reports/TEMPLATE.md`, `scripts/preflight.mjs`, `scripts/gibs-catalog.mjs`, `scripts/lib/http.mjs`, `playwright.config.ts`, `tests/helpers.ts`, `tests/harness.spec.ts`, `tests/acceptance.spec.ts`, `evidence/chat-sandbox-preflight.json`. Copy them into the repository root with these paths, then run the first message above.
