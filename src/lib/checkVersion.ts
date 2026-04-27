/**
 * Version consistency checker.
 * Exported as a pure function so it can be unit-tested.
 * The CLI entry point lives in scripts/check-version.mjs.
 */

export interface VersionSources {
  packageJson: string;
  tauriConf: string;
  cargoToml: string;
  splashScreen: string;
  dashboardFallback: string;
  aboutDialogFallback: string;
  /** Already stripped of the leading "v". undefined = not a tag push, skip check. */
  gitTag: string | undefined;
}

export function checkVersions(sources: VersionSources): void {
  const base = sources.packageJson;
  const mismatches: string[] = [];

  const checks: Array<[string, string]> = [
    ['src-tauri/tauri.conf.json', sources.tauriConf],
    ['src-tauri/Cargo.toml', sources.cargoToml],
    ['src/components/SplashScreen.tsx (APP_VERSION)', sources.splashScreen],
    ['src/components/Dashboard.tsx (useState fallback)', sources.dashboardFallback],
    ['src/components/AboutDialog.tsx (APP_VERSION_FALLBACK)', sources.aboutDialogFallback],
  ];

  for (const [label, version] of checks) {
    if (version !== base) {
      mismatches.push(`  ${label}: "${version}" (expected "${base}")`);
    }
  }

  if (sources.gitTag !== undefined && sources.gitTag !== base) {
    mismatches.push(`  git tag: "${sources.gitTag}" (expected "${base}")`);
  }

  if (mismatches.length > 0) {
    console.error(`\nVersion mismatch detected (baseline: package.json = "${base}"):`);
    for (const m of mismatches) console.error(m);
    console.error('');
    process.exit(1);
  } else {
    const tagLine =
      sources.gitTag !== undefined ? ` | git tag: ${sources.gitTag}` : '';
    console.log(`All versions consistent: ${base}${tagLine} ✓`);
  }
}
