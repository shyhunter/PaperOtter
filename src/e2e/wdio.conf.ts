import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn, type ChildProcess } from 'child_process';
import { waitTauriDriverReady } from '@crabnebula/tauri-driver';
import { waitTestRunnerBackendReady } from '@crabnebula/test-runner-backend';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve the Tauri binary path for the current platform.
// E2E tests run against a debug build so tauri-plugin-automation is compiled in.
function getTauriBinaryPath(): string {
  if (process.platform === 'darwin') {
    return join(__dirname, '../../src-tauri/target/debug/bundle/macos/Papercut.app/Contents/MacOS/Papercut');
  }
  if (process.platform === 'win32') {
    return join(__dirname, '../../src-tauri/target/debug/Papercut.exe');
  }
  // Linux
  return join(__dirname, '../../src-tauri/target/debug/papercut');
}

// Keep track of child processes
let tauriDriver: ChildProcess | undefined;
let testRunnerBackend: ChildProcess | undefined;
let killedTauriDriver = false;
let killedTestRunnerBackend = false;

function closeAll(): void {
  killedTauriDriver = true;
  killedTestRunnerBackend = true;
  tauriDriver?.kill();
  testRunnerBackend?.kill();
}

/**
 * `tauri:options` is a vendor capability not yet declared in @wdio/types.
 * Use an extension interface to satisfy TypeScript without losing type safety
 * on the rest of the config object.
 */
interface TauriCapability {
  'tauri:options': { application: string };
}

export const config: WebdriverIO.Config = {
  runner: 'local',

  specs: [join(__dirname, 'tests/**/*.test.ts')],
  exclude: [],
  maxInstances: 1, // Tauri apps are single-instance; never run in parallel

  capabilities: [{ 'tauri:options': { application: getTauriBinaryPath() } } as unknown as TauriCapability & WebdriverIO.Capabilities],

  logLevel: 'warn',
  bail: 0,
  waitforTimeout: 15000,
  connectionRetryTimeout: 60000,
  connectionRetryCount: 3,

  framework: 'mocha',
  reporters: ['spec'],

  mochaOpts: {
    ui: 'bdd',
    timeout: 120000, // full E2E flows including GS can take 30-60 s
  },

  // Screenshots on failure are saved to .e2e-artifacts/screenshots/ by screenshotOnFailure()
  // in src/e2e/helpers/driver.ts

  // Linux headless support: set DISPLAY=:99 when running under Xvfb and no DISPLAY is set.
  // On macOS/Windows this block is a no-op.
  // To run on Linux CI: start Xvfb first with `Xvfb :99 -screen 0 1280x960x24 &`
  // then run `npm run test:e2e` -- the hook below ensures DISPLAY is forwarded automatically.
  before(): void {
    if (process.platform === 'linux' && !process.env.DISPLAY) {
      process.env.DISPLAY = ':99';
    }
  },

  // macOS: start test-runner-backend which bridges WebDriver requests to the
  // tauri-plugin-automation instance running inside the debug app build.
  // tauri-driver is then told to proxy to it via REMOTE_WEBDRIVER_URL.
  onPrepare: async (): Promise<void> => {
    if (process.platform === 'darwin') {
      testRunnerBackend = spawn('npx', ['test-runner-backend'], {
        stdio: [null, process.stdout, process.stderr],
        shell: true,
      });
      testRunnerBackend.on('error', (error: Error) => {
        console.error('test-runner-backend error:', error);
        process.exit(1);
      });
      testRunnerBackend.on('exit', (code: number | null) => {
        if (!killedTestRunnerBackend) {
          console.error('test-runner-backend exited unexpectedly with code:', code);
          process.exit(1);
        }
      });
      await waitTestRunnerBackendReady();
      // Tell tauri-driver to forward WebDriver requests to the local backend
      process.env.REMOTE_WEBDRIVER_URL = 'http://127.0.0.1:3000';
    }
  },

  // Start tauri-driver before each WebDriverIO session so it can proxy requests.
  beforeSession: async (): Promise<void> => {
    tauriDriver = spawn('npx', ['tauri-driver'], {
      stdio: [null, process.stdout, process.stderr],
      shell: true,
    });
    tauriDriver.on('error', (error: Error) => {
      console.error('tauri-driver error:', error);
      process.exit(1);
    });
    tauriDriver.on('exit', (code: number | null) => {
      if (!killedTauriDriver) {
        console.error('tauri-driver exited unexpectedly with code:', code);
        process.exit(1);
      }
    });

    // Wait for tauri-driver to initialize its proxy server (port 4444)
    await waitTauriDriverReady();
  },

  // Clean up after each session
  afterSession: (): void => {
    killedTauriDriver = true;
    tauriDriver?.kill();
  },

  // Clean up test-runner-backend when the full run is done
  onComplete: (): void => {
    closeAll();
  },
};
