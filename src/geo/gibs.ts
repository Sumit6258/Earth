export const GIBS_BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best';

/** EPSG:4326 GIBS tile bounds in degrees. Level-0 tiles are 288 degrees wide and the grid starts at (-180, 90); x is the column, y the row. */
export function gibsTileBounds(level: number, x: number, y: number) {
  const span = 288 / 2 ** level;
  return { west: -180 + x * span, east: -180 + (x + 1) * span, north: 90 - y * span, south: 90 - (y + 1) * span };
}

/** WMTS REST template for a GIBS layer. Static layers have no date segment. */
export const gibsUrl = (layer: string, ext: 'jpeg' | 'jpg' | 'png', date?: string) =>
  `${GIBS_BASE}/${layer}/default/${date ? `${date}/` : ''}{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.${ext}`;

export const utcDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
