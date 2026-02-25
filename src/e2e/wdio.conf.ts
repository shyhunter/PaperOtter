import { join } from 'path';
import { spawn, type ChildProcess } from 'child_process';
import type { Options } from '@wdio/types';
import { waitTauriDriverReady } from '@crabnebula/tauri-driver';

// Resolve the Tauri binary path for the current platform
function getTauriBinaryPath(): string {
  if (process.platform === 'darwin') {
    return join(__dirname, '../../src-tauri/target/release/bundle/macos/Papercut.app/Contents/MacOS/Papercut');
  }
  if (process.platform === 'win32') {
    return join(__dirname, '../../src-tauri/target/release/Papercut.exe');
  }
  // Linux
  return join(__dirname, '../../src-tauri/target/release/papercut');
}

// keep track of the tauri-driver child process
let tauriDriver: ChildProcess | undefined;
let killedTauriDriver = false;

function closeTauriDriver(): void {
  killedTauriDriver = true;
  tauriDriver?.kill();
}

export const config: Options.Testrunner = {
  runner: 'local',
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: { project: join(__dirname, '../../tsconfig.json') },
  },

  specs: ['src/e2e/tests/**/*.test.ts'],
  exclude: [],
  maxInstances: 1, // Tauri apps are single-instance; never run in parallel

  capabilities: [{
    maxInstances: 1,
    'tauri:options': {
      application: getTauriBinaryPath(),
    },
  }],

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

  // Artifact directory for screenshots captured in screenshotOnFailure()
  screenshotPath: '.e2e-artifacts/screenshots',

  // Linux headless support: set DISPLAY=:99 when running under Xvfb and no DISPLAY is set.
  // On macOS/Windows this block is a no-op.
  // To run on Linux CI: start Xvfb first with `Xvfb :99 -screen 0 1280x960x24 &`
  // then run `npm run test:e2e` -- the hook below ensures DISPLAY is forwarded automatically.
  before(): void {
    if (process.platform === 'linux' && !process.env.DISPLAY) {
      process.env.DISPLAY = ':99';
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

  // Clean up tauri-driver after each session
  afterSession: (): void => {
    closeTauriDriver();
  },
};
