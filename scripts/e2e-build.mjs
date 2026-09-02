#!/usr/bin/env node
// Build the debug app the E2E suite drives, on whichever platform is running.
//
// The bundle flag is not portable. `--bundles app` produces the .app tree that
// macOS needs, because the WebDriver session launches
// `Papercut.app/Contents/MacOS/tauri-app` and the Ghostscript sidecar has to sit
// beside it inside the bundle. On Linux and Windows there is no such tree —
// `app` is not a bundle type there at all — and the suite launches the plain
// binary from `target/debug/`, so bundling is wasted work that also fails.
//
// This was hardcoded to `--bundles app`, which meant `npm run test:regressions`
// could not run on Linux: it failed during the build, before wdio ever started,
// on the one platform where the suite has the most to say. CI sidestepped it by
// calling tauri directly with `--no-bundle` and never noticed the npm script had
// drifted.
//
// Keep this in step with getTauriBinaryPath() in src/e2e/wdio.conf.ts — the two
// have to agree about where the binary lands.
import { spawnSync } from 'node:child_process';

const bundling = process.platform === 'darwin'
  ? ['--bundles', 'app']
  : ['--no-bundle'];

const args = ['tauri', 'build', '--debug', '--features', 'e2e', ...bundling];
console.log(`> npx ${args.join(' ')}`);

const { status } = spawnSync('npx', args, { stdio: 'inherit' });
process.exit(status ?? 1);
