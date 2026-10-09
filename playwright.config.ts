import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';

const port = process.env.E2E_PORT || '3103';
const baseURL = `http://127.0.0.1:${port}`;
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (process.platform === 'win32' && existsSync(chromePath) ? chromePath : undefined);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure', launchOptions: { executablePath } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }],
  webServer: {
    command: 'node --import tsx server/index.ts',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 30000,
    // Each invocation owns a fresh directory; tests never touch a user's workspace.
    env: { PORT: port, HOST: '127.0.0.1', DATA_DIR: path.join(tmpdir(), `roam-e2e-${randomUUID()}`), WEATHER_ENABLED: 'false', OPENAI_API_KEY: '', AMAP_KEY: '', APP_ORIGIN: baseURL },
  },
});
