import { defineConfig, devices } from '@playwright/test';

/**
 * EARTH acceptance config.
 * - Two projects (desktop, mobile) run EVERY test: a milestone is not green until both are.
 * - Cloud VMs have no GPU: Chromium falls back to SwiftShader (software WebGL2). That proves correctness, not frame rate.
 *   Tests therefore load the app with ?q=performance and assert behaviour/state/pixels, never FPS.
 * - workers: 1 on purpose — software GL is CPU bound and parallel runs starve each other into timeouts.
 * - EARTH_BASE_URL points the suite at a deployed preview (Cloudflare Pages / Vercel / Netlify) instead of a local build.
 */
const BASE = process.env.EARTH_BASE_URL ?? 'http://127.0.0.1:4173';

export const GL_ARGS = [
  '--use-angle=swiftshader',
  '--use-gl=angle',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--enable-webgl',
  '--disable-dev-shm-usage',
];

export default defineConfig({
  testDir: './tests',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'docs/evidence/playwright-report', open: 'never' }],
    ['json', { outputFile: process.env.PW_JSON ?? 'docs/evidence/results.json' }],
  ],
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions: { args: GL_ARGS },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.EARTH_BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
        url: BASE,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
      },
});
