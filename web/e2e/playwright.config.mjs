import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  testDir: here,
  testMatch: '*.spec.mjs',
  timeout: 35_000,
  expect: { timeout: 8_000 },
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  fullyParallel: true,
  reporter: [['list'], ['json', {outputFile:resolve(here,'playwright-results.json')}], ['html', { outputFolder: resolve(here,'playwright-report'), open: 'never' }]],
  outputDir: resolve(here,'test-results'),
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name:'chromium-desktop', use:{...devices['Desktop Chrome'],viewport:{width:1280,height:800}} },
    { name:'chromium-mobile', use:{browserName:'chromium',viewport:{width:375,height:812},isMobile:true,hasTouch:true,deviceScaleFactor:1} },
  ],
  webServer:[
    {
      command:'npm run dev -- --port 4173 --strictPort',
      cwd:resolve(here,'..'),url:'http://127.0.0.1:4173',
      reuseExistingServer:false,timeout:60_000,
      env:{EPUSDT_BACKEND:'http://127.0.0.1:1'},
    },
    {
      command:'node w61-original-server.mjs',
      cwd:here,url:'http://127.0.0.1:4174',
      reuseExistingServer:false,timeout:60_000,
    },
  ],
});
