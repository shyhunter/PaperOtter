import { join, dirname } from 'path';
import ResultsReporter, { resetParts, writeSummary } from './reporters/results-reporter';
import { buildKnownFixtures } from './fixtures/known';
import { fileURLToPath } from 'url';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { createConnection } from 'net';
import { mkdirSync, copyFileSync, readdirSync, statSync, existsSync, renameSync, rmSync } from 'fs';
import { tmpdir, homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Stage fixtures into Tauri's $TEMP fs scope before specs are imported.
//
// Tauri's capability scope (src-tauri/capabilities/default.json) only permits
// reads from $DOCUMENT/$DOWNLOAD/$DESKTOP/$TEMP. The project's test-fixtures/
// directory is outside every allowed scope, so reading fixtures directly from
// there fails the runtime fs check and the UI never advances past step 0.
//
// We mirror real fixtures into ${tmpdir}/papercut-e2e/real/ here, and the
// pretest:e2e script generates error-path fixtures into ${tmpdir}/papercut-e2e/
// error/. The driver helper picks both up via E2E_*_DIR env vars set below.
const STAGE_DIR = join(tmpdir(), 'papercut-e2e');
const STAGE_REAL = join(STAGE_DIR, 'real');
const STAGE_ERROR = join(STAGE_DIR, 'error');
const STAGE_OUTPUT = join(STAGE_DIR, 'output');
const STAGE_KNOWN = join(STAGE_DIR, 'known');
mkdirSync(STAGE_REAL, { recursive: true });
mkdirSync(STAGE_ERROR, { recursive: true });
mkdirSync(STAGE_OUTPUT, { recursive: true });
mkdirSync(STAGE_KNOWN, { recursive: true });

const PROJECT_REAL_FIXTURES = join(__dirname, '../../test-fixtures');
for (const entry of readdirSync(PROJECT_REAL_FIXTURES)) {
  const src = join(PROJECT_REAL_FIXTURES, entry);
  if (statSync(src).isFile()) {
    copyFileSync(src, join(STAGE_REAL, entry));
  }
}

process.env.E2E_REAL_FIXTURES_DIR ??= STAGE_REAL;
process.env.E2E_FIXTURES_DIR ??= STAGE_ERROR;
process.env.E2E_OUTPUT_DIR ??= STAGE_OUTPUT;
process.env.E2E_KNOWN_DIR ??= STAGE_KNOWN;

// Resolve the Tauri binary path for the current platform.
// E2E tests run against a debug build with `--features e2e` so the
// tauri-plugin-webdriver-automation plugin is registered.
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

// The app's own settings file, and why the suite moves it out of the way.
//
// Saved settings, favourites and recent folders all persist through
// tauri-plugin-store into one file under the bundle identifier's data
// directory. The debug build the suite drives shares that file with the real
// app, which cost twice over: a spec asserting "nothing is saved yet" passed
// once and then failed on every later run, having saved something; and a run
// left its own scratch directories in the user's Recent list.
//
// So the file is set aside for the duration and put back afterwards. Every run
// starts from a genuinely first-launch profile, and the user's own settings are
// neither read nor written.
function settingsFile(): string {
  const id = 'com.papercut.app'; // tauri.conf.json → identifier
  const home = homedir();
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support', id, 'papercut-settings.json');
  }
  if (process.platform === 'win32') {
    return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), id, 'papercut-settings.json');
  }
  return join(process.env.XDG_DATA_HOME ?? join(home, '.local', 'share'), id, 'papercut-settings.json');
}

const SETTINGS_FILE = settingsFile();
const SETTINGS_BACKUP = `${SETTINGS_FILE}.e2e-backup`;

function stashUserSettings(): void {
  // A backup left by a run that was killed still holds the real settings —
  // never overwrite it with the scratch profile that run created.
  if (existsSync(SETTINGS_FILE) && !existsSync(SETTINGS_BACKUP)) {
    renameSync(SETTINGS_FILE, SETTINGS_BACKUP);
  } else if (existsSync(SETTINGS_FILE)) {
    rmSync(SETTINGS_FILE);
  }
}

function restoreUserSettings(): void {
  const owned = process.env.E2E_PROFILE_STASHED === '1';
  delete process.env.E2E_PROFILE_STASHED;
  if (!owned) return;

  // Whatever is there now is the scratch profile this run created — favourites
  // it clicked, folders it visited, settings it saved. Left in place it becomes
  // the starting state of the next run, and of the next real launch of the app.
  rmSync(SETTINGS_FILE, { force: true });
  if (existsSync(SETTINGS_BACKUP)) renameSync(SETTINGS_BACKUP, SETTINGS_FILE);
}

// Kill the app started for this run. Matched on the debug binary path, never on
// the app name: a Papercut the user has open for real must survive the suite.
function killAppProcesses(): void {
  spawnSync('pkill', ['-f', getTauriBinaryPath()], { stdio: 'ignore' });
  spawnSync('pkill', ['-f', 'tauri-wd'], { stdio: 'ignore' });
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
const plannedSpecs: string[] = [];

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
    // Every defect fixed by hand and then pinned here, so it can be re-checked
    // without anyone preparing a file first. Each spec builds its own fixtures.
    regressions: [join(__dirname, 'tests/regressions/**/*.test.ts')],
  },

  capabilities: [{ 'tauri:options': { binary: getTauriBinaryPath() } } as unknown as TauriCapability & WebdriverIO.Capabilities],

  // Connect to tauri-wd which starts in beforeSession on port 4444
  hostname: '127.0.0.1',
  port: 4444,

  logLevel: 'warn',
  // No bail. It was here to stop a timeout cascade, and the cascade it was
  // guarding against came from the automation plugin panicking on refresh —
  // fixed by never refreshing. What it does now is hide specs: on 2026-09-02 it
  // ended a run before save-location.test.ts was ever handed to a worker, and
  // the report could not even say so, because a spec that never starts has no
  // worker to be counted from. A local suite that finishes slowly beats one
  // that finishes early and quietly omits a fifth of itself.
  bail: 0,
  waitforTimeout: 15000,
  connectionRetryTimeout: 60000,
  // Session initialisation polls GET /window before any hook of ours can run,
  // and the Tauri window does not exist the instant the plugin announces its
  // port. On a CI runner (debug build under xvfb) the app takes ~25 s just to
  // announce that port, and the window follows some time after; 3 retries only
  // covers ~1.5 s, so the session failed with "no window" before the window had
  // any chance to appear. Locally the window turns up on the 4th attempt.
  connectionRetryCount: 30,

  framework: 'mocha',
  // 'spec' prints to a terminal that scrolls away; the results reporter leaves a
  // readable record in .e2e-results/ so a run can be looked at afterwards, and
  // from a different machine than the one that ran it.
  reporters: ['spec', [ResultsReporter, {}]],

  mochaOpts: {
    ui: 'bdd',
    timeout: 120000, // full E2E flows including GS can take 30-60 s
  },

  // Launcher-side, once per run.
  onPrepare: async (): Promise<void> => {
    resetParts();
    // Rebuilt every run rather than committed: they are derived from the
    // declarations in known.ts, and a stale copy on disk would let a test and
    // its fixture drift apart silently.
    await buildKnownFixtures(STAGE_KNOWN);

    // The error-path fixtures — a 110 MB sparse file, a zero-byte stub — used to
    // come only from `npm run pretest:e2e`, so running wdio directly left the
    // oversize tests looking for a file nobody had made. They failed with
    // "the modal never appeared", which points at the app rather than at the
    // missing fixture and cost a diagnosis. The suite is supposed to prepare
    // everything it needs; this is part of everything.
    // The generator is a plain .mjs script with no types; the URL form keeps
    // TypeScript from demanding a declaration file for something that exports
    // nothing and is imported purely for its effect.
    await import(new URL('./fixtures/generate-e2e-fixtures.mjs', import.meta.url).href);
    plannedSpecs.length = 0;
    stashUserSettings();
    process.env.E2E_PROFILE_STASHED = '1';
  },

  // Every spec file WDIO actually hands to a worker. Collected so the summary
  // can name a spec that produced no results at all, rather than leaving a
  // crashed spec out and reading as a shorter, healthier run than it was.
  onWorkerStart: (_cid: string, _caps: unknown, specs: string[]): void => {
    plannedSpecs.push(...specs);
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
    // The 'exit' handler below treats an unexpected exit as fatal. Arm it here,
    // per session: afterSession used to set the flag and clear it again in the
    // same tick, so the event — which arrives on a later tick — always read
    // `false` and killed the worker with code 1 on a perfectly good run.
    killedTauriWd = false;
    // Each spec file gets its own app process; give it its own profile too, or
    // one spec's saved settings silently become the next one's starting state.
    //
    // Only ever when onPrepare has actually stashed the real file. Workers load
    // this config fresh from disk, so a run whose launcher started before an
    // edit to this file will happily run workers that came after it — and on
    // 2026-09-02 that deleted a real settings file outright, 26 KB of
    // favourites, recent folders and saved signatures, with no backup taken
    // because the launcher's onPrepare had never seen the stashing code. The
    // env var is set by onPrepare and inherited by every worker it spawns, so
    // it is only ever true when a backup exists.
    if (process.env.E2E_PROFILE_STASHED === '1') {
      rmSync(SETTINGS_FILE, { force: true });
    }
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

  // Bound the session teardown that follows this hook.
  //
  // After the last test WDIO sends DELETE /session to tauri-wd, which asks the
  // Tauri app to quit. On macOS the app does not always go, and that request
  // then never returns: on 2026-09-02 a run wrote its results at 09:43:56 and
  // sat idle for nine more minutes, holding the terminal, with tauri-wd and the
  // app still alive and every process at 0% CPU. Nothing downstream bounds it —
  // connectionRetryTimeout covers connecting, not an answered-but-silent
  // request — so it has to be bounded here. `result` is the exit code WDIO
  // would have used, so a hung teardown cannot turn a green run red.
  after: (result: number): void => {
    const watchdog = setTimeout(() => {
      console.error('[wdio] teardown did not finish in 20s — killing the app and exiting');
      killAppProcesses();
      process.exit(result);
    }, 20000);
    // Only fires if something else is still holding the loop open.
    watchdog.unref();
  },

  // Clean up after each session.
  //
  // tauri-wd spawns the app as its own child, so killing tauri-wd can orphan
  // the app; kill both, matching on the debug bundle path alone so a Papercut
  // the user has open for real is never touched.
  afterSession: (): void => {
    killedTauriWd = true;
    tauriWd?.kill();
    killAppProcesses();
  },

  // Final cleanup
  onComplete: (): void => {
    killedTauriWd = true;
    tauriWd?.kill();
    killAppProcesses();
    restoreUserSettings();
    // Launcher-side merge of the per-spec parts. This is the only place that
    // has seen the whole run.
    const slowdowns = writeSummary(plannedSpecs);
    // A run that got dramatically slower is a result, not a footnote. WDIO has
    // already set a failing code if a test failed; this only ever adds one.
    if (slowdowns > 0) {
      console.error(`[wdio] ${slowdowns} test(s) ran more than 3x their baseline — see .e2e-results/latest.md`);
      // Set on the way out, not here. WDIO decides the exit code after this
      // hook returns and overwrites anything set during it, so a plain
      // `process.exitCode = 1` printed the warning and still exited 0 — a
      // guard that reports and passes is a guard nobody acts on. Assigning
      // inside an 'exit' listener is the one place Node lets it stick.
      process.on('exit', () => { process.exitCode = 1; });
    }
  },
};
