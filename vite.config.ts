import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: '/',
  define: {
    __BUILD_SHA__: JSON.stringify((process.env.GITHUB_SHA ?? 'local').slice(0, 7)),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 6000, // the lazily loaded Cesium chunk is large by nature
    rollupOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), cesium: fileURLToPath(new URL('./cesium.html', import.meta.url)) } },
  },
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
