# Releasing PaperOtter

Most of a release is automatic once the tag is pushed. This page lists the
steps that are not, what to check afterwards, and the mistakes that have
already cost a release once.

## 1. Prepare, on a `release/x.y.z` branch

- **Bump the version everywhere at once.** That means `package.json` and its
  lockfile, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and
  `Cargo.lock`, the in-app fallbacks (`SplashScreen.tsx`, `Dashboard.tsx`,
  `AboutDialog.tsx`), and `src/browser-tests/tauri-mock/app.ts`.
  `npm run version:check` must pass; the release job runs it against the tag.
- **Write `docs/release-notes/vx.y.z.md`.** `release.yml` puts it above the
  install table on the release page.
- **Update the download links in `site/index.html`** to the new version. The
  README needs nothing: it links to `/releases/latest`.
- **Regenerate notices after any lockfile change:** `npm run notices`, then
  `npm run notices:check`.
- **Keep Tauri's npm packages and Rust crates on the same major.minor:**
  `npm run tauri:versions:check`.
- **Run the end-to-end suite locally.** PR CI never runs it:
  `npm run e2e:build`, `npm run pretest:e2e`, then
  `npx wdio run src/e2e/wdio.conf.ts`. The test app opens and closes on screen.
- **Test real installers before tagging.** Start `linux-test-build.yml` and
  `windows-test-build.yml` **from the branch itself**:
  `gh workflow run linux-test-build.yml --ref <branch> -f ref=<branch>`.
  `--ref` picks which copy of the workflow runs and `-f ref=` picks the code;
  starting it from `main` runs `main`'s steps, so a step added on the branch
  silently doesn't run.

## 2. Merge, then tag

- **Open a PR into `main`.** The required checks are validate, rust-checks,
  rust-integration, gitleaks and the dependency audit. Never bypass branch
  protection with an admin merge.
- **After the merge, tag the merge commit and push the tag.**
  Pushing a `v*` tag is the only thing that starts `release.yml`:
  `git tag -a vx.y.z -m "PaperOtter x.y.z" && git push origin vx.y.z`

## 3. What `release.yml` then does by itself

1. It runs the test gate and builds all five installers into a draft release.
2. It installs each one on a real machine (the smoke tests).
3. It publishes `SHA256SUMS.txt` and a signed build-provenance attestation.
4. It publishes the release and marks it **latest** only if it is the newest
   version.
5. It opens the Announcements discussion and builds the winget manifests.
6. It starts `pages.yml`, so the landing page switches to the new version.

## 4. Check by hand afterwards

- [ ] **Latest:** `gh api repos/shyhunter/PaperOtter/releases/latest --jq .tag_name` prints the new tag.
- [ ] **Site:** <https://shyhunter.github.io/PaperOtter/>. All five download buttons point at the new version and download. If they don't, run `pages.yml` from the Actions tab.
- [ ] **Provenance:** `gh attestation verify <installer> --repo shyhunter/PaperOtter` passes on a downloaded installer.
- [ ] **Install from the published links**, not from a CI artifact, on macOS, Windows and Linux, including the `.deb` upgrade over an installed version.
- [ ] **Announcement:** shorten the Discussions post if the full notes are too long for it.
- [ ] **Leftovers:** close Dependabot PRs the release made redundant, and delete merged branches.

## Lessons learned

Each of these has happened. The checks that now prevent them are named so
that nobody removes one by accident.

- **A workflow's own token can't start other workflows.**
  A release published with `GITHUB_TOKEN` never fires `release: published` in
  other workflows; GitHub suppresses token-created events, except
  `workflow_dispatch`. In v1.0.2 this left the site offering 1.0.1 until it
  was deployed by hand. `release.yml` now starts `pages.yml` itself
  (LATEST-03). **Whenever a workflow should react to something another
  workflow does, dispatch it explicitly. Don't rely on the event.**
- **The download buttons follow the latest *published* release.** They used to
  take the version from `tauri.conf.json`, so merging a version bump pointed
  every button at installers that didn't exist yet (LATEST-02).
- **"Latest" is chosen by version, not by date.** GitHub's default is "most
  recently published", so a 1.0.3 hotfix after 1.1.0 would have sent every
  older install to 1.0.3. The rule: whatever version someone runs, the update
  notice and the site send them to the newest one (LATEST-01).
- **Every CI job has a time limit.** On PR #66 `apt-get install` hung for
  33 minutes; a rerun took 27 seconds. Without a limit, a required check can
  block for six hours (CI-TIMEOUT-01). If a step hangs, cancel and rerun it.
- **A test build started from `main` runs `main`'s workflow.** The first
  metainfo validation "passed" without running at all: the new
  `appstreamcli` step only existed on the branch. When it did run, it
  caught a link type Ubuntu 22.04's validator rejects.
- **A Dependabot PR can be superseded by the release.** When a release branch
  makes the same bump, don't merge the Dependabot PR too; it only conflicts
  on the lockfile and NOTICES.
