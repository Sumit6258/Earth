# Decisions log

One entry per decision, newest first. Format: **D# — title** · date · decided by (owner / agent-default / spike) · evidence link · consequences.

| # | Decision | Status | Evidence |
|---|---|---|---|
| D1 | UI layer: vanilla TypeScript vs React | open (default: vanilla) | |
| D2 | GIBS projection per use: EPSG:4326 custom tiling scheme vs EPSG:3857 | open (M0 spike decides) | `docs/evidence/M0/` |
| D3 | SSP1-1.9 regional grids: pattern-scaled vs SSP1-2.6 grid with SSP1-1.9 global numbers | open (default: pattern-scaled, labelled) | |
| D4 | Cloud texture source | open (default: dated MODIS Terra+Aqua composite) | |
| D5 | Terrain: Cesium ion token or none | open (default: none until M3 needs it) | |
| D6 | FIRMS sensors given the possible 2026-11-01 product cessation | open (default: NOAA-20/21 VIIRS, verify in M0) | |
| D7 | Preview host | open | |
| D8 | Serverless host for the FIRMS job | open (default: same vendor as D7) | |
