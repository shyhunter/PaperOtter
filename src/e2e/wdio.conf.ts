import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { createConnection } from 'net';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve the Tauri binary path for the current platform.
// E2E tests run against a debug build so tauri-plugin-webdriver-automation is compiled in.
function getTauriBinaryPath(): string {
  if (process.platform === 'darwin') {
    return join(__dirname, '../../src-tauri/target/debug/bundle/macos/Papercut.app/Contents/MacOS/tauri-app');
  }
  if (process.platform === 'win32') {
    return join(__dirname, '../../src-tauri/target/debug/tauri-app.exe');
  }
  // Linux
  return join(__dirname, '../../src-tauri/target/debug/tauri-app');
}

// Poll until something is listening on the given port (TCP connect succeeds).
function waitForPort(port: number, host = '127.0.0.1', retryIntervalMs = 200): Promise<void> {
  return new Promise((resolve) => {
    const tryConnect = (): void => {
      const sock = createConnection(port, host);
      sock.on('connect', () => { sock.destroy(); resolve(); });
      sock.on('error', () => setTimeout(tryConnect, retryIntervalMs));
    };
    tryConnect();
  });
}

// Keep track of the tauri-wd child process
let tauriWd: ChildProcess | undefined;
let killedTauriWd = false;

/**
 * `tauri:options` is a vendor capability not yet declared in @wdio/types.
 * Use an extension interface to satisfy TypeScript without losing type safety
 * on the rest of the config object.
 */
interface TauriCapability {
  'tauri:options': { binary: string };
}

export const config: WebdriverIO.Config = {
  runner: 'local',

  specs: [join(__dirname, 'tests/**/*.test.ts')],
  exclude: [],
  maxInstances: 1, // Tauri apps are single-instance; never run in parallel

  // Named suites allow running a subset of specs:
  //   npx wdio run src/e2e/wdio.conf.ts --suite pdf
  //   npx wdio run src/e2e/wdio.conf.ts --suite image
  suites: {
    pdf:   [join(__dirname, 'tests/pdf-flows.test.ts')],
    image: [join(__dirname, 'tests/image-flows.test.ts')],
  },

  capabilities: [{ 'tauri:options': { binary: getTauriBinaryPath() } } as unknown as TauriCapability & WebdriverIO.Capabilities],

  // Connect to tauri-wd which starts in beforeSession on port 4444
  hostname: '127.0.0.1',
  port: 4444,

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

  // Linux headless support: set DISPLAY=:99 when running under Xvfb and no DISPLAY is set.
  before(): void {
    if (process.platform === 'linux' && !process.env.DISPLAY) {
      process.env.DISPLAY = ':99';
    }
  },

  // Start tauri-wd before each WebDriverIO session so it can manage the Tauri app.
  // tauri-wd is the open-source WebDriver server for Tauri (no cloud key needed).
  beforeSession: async (): Promise<void> => {
    // Kill any leftover tauri-wd from a previous run (frees port 4444).
    spawnSync('pkill', ['-f', 'tauri-wd'], { stdio: 'ignore' });
    // Wait for the OS to release port 4444 before binding again.
    await new Promise<void>((r) => setTimeout(r, 500));

    tauriWd = spawn('tauri-wd', ['--port', '4444'], {
      stdio: [null, process.stdout, process.stderr],
      env: {
        ...process.env,
        // Headless CI environments may lack a GPU; disable DMA-BUF to prevent
        // WebKitGTK rendering failures in Xvfb.
        WEBKIT_DISABLE_DMABUF_RENDERER: '1',
      },
    });
    tauriWd.on('error', (error: Error) => {
      console.error('tauri-wd error:', error);
      process.exit(1);
    });
    tauriWd.on('exit', (code: number | null) => {
      if (!killedTauriWd) {
        console.error('tauri-wd exited unexpectedly with code:', code);
        process.exit(1);
      }
    });

    // Wait for tauri-wd to initialize its WebDriver server on port 4444
    await waitForPort(4444);
  },

  // Clean up after each session
  afterSession: (): void => {
    killedTauriWd = true;
    tauriWd?.kill();
    killedTauriWd = false; // reset for next session
  },

  // Final cleanup
  onComplete: (): void => {
    killedTauriWd = true;
    tauriWd?.kill();
  },
};
