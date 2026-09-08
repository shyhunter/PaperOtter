/**
 * Vite config for the browser-test harness. Never used by `tauri dev` or a release build.
 *
 * Its whole job is one substitution: every `@tauri-apps/*` specifier resolves to
 * a mock in `src/browser-tests/tauri-mock/`. The 62 source files that import
 * those modules are untouched, and the components under test are the shipped
 * ones — the swap happens below them, at the only boundary the app has to the
 * native side.
 *
 * Kept as a separate file rather than a mode flag in `vite.config.ts` so that no
 * production build can reach the mocks by misconfiguration. A harness that can
 * leak into a release is worse than no harness.
 *
 * Aliases are anchored regexes, not the object form: object aliases match by
 * prefix, so `@tauri-apps/api/app` would also capture anything beginning with
 * that string.
 */
import { defineConfig, type ConfigEnv, type UserConfig } from 'vite';
import path from 'path';
import baseConfig from './vite.config';

const src = path.resolve(__dirname, './src');
const mock = (name: string) => path.resolve(src, 'browser-tests/tauri-mock', `${name}.ts`);

/** Every specifier the app actually imports. Anything else must fail to resolve. */
const TAURI_ALIASES = [
  { find: /^@tauri-apps\/api\/app$/, replacement: mock('app') },
  { find: /^@tauri-apps\/api\/core$/, replacement: mock('core') },
  { find: /^@tauri-apps\/api\/event$/, replacement: mock('event') },
  { find: /^@tauri-apps\/api\/path$/, replacement: mock('path') },
  { find: /^@tauri-apps\/api\/webview$/, replacement: mock('webview') },
  { find: /^@tauri-apps\/api\/window$/, replacement: mock('window') },
  { find: /^@tauri-apps\/plugin-dialog$/, replacement: mock('plugin-dialog') },
  { find: /^@tauri-apps\/plugin-fs$/, replacement: mock('plugin-fs') },
  { find: /^@tauri-apps\/plugin-http$/, replacement: mock('plugin-http') },
  { find: /^@tauri-apps\/plugin-opener$/, replacement: mock('plugin-opener') },
  { find: /^@tauri-apps\/plugin-shell$/, replacement: mock('plugin-shell') },
  { find: /^@tauri-apps\/plugin-store$/, replacement: mock('plugin-store') },
];

export default defineConfig(async (env: ConfigEnv): Promise<UserConfig> => {
  const base = await (baseConfig as unknown as (e: ConfigEnv) => Promise<UserConfig>)(env);

  return {
    ...base,
    resolve: {
      // The array form replaces the base's object form wholesale, so `@` is
      // restated here rather than merged — a half-merged alias table resolves
      // some imports and silently misses others.
      alias: [{ find: /^@\//, replacement: `${src}/` }, ...TAURI_ALIASES],
    },
    server: {
      ...base.server,
      // The base pins 1420 for Tauri and fails if taken. The harness gets its
      // own port from the command line and must not fight a running dev server.
      port: undefined,
      strictPort: false,
      host: false,
    },
  };
});
