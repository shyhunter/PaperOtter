# Contributing to Papercut

Thanks for taking the time. This is a small project, so the process is light.

## Reporting bugs and requesting features

Use the issue templates — [Bug Report](.github/ISSUE_TEMPLATE/bug_report.yml) or
[Feature Request](.github/ISSUE_TEMPLATE/feature_request.yml). For a bug, the two
things that matter most are **how to reproduce it** and **the file it happened
with**, if you can share one. Papercut deals with documents, and many bugs only
appear on a particular file.

If the app crashed, the crash dialog can pre-fill a report for you.

For anything security-related, do not open an issue — see [SECURITY.md](SECURITY.md).

## Getting set up

Requires Node 20 and a stable Rust toolchain.

```bash
npm install
npm run tauri dev
```

## Before opening a pull request

```bash
npm run test          # Vitest — the whole suite
npx tsc --noEmit      # type check
npm run lint
cd src-tauri && cargo clippy -- -D warnings && cargo test --lib
```

CI runs the same checks. It skips the Rust jobs when nothing under `src-tauri/`
changed, and skips everything for documentation-only changes, so a small PR is
cheap.

## House rules

These come from `.claude/project_rules_decisions.md` and are worth knowing,
because they are enforced in review:

- **Tests come first.** A bug fix ships with a regression test that fails before
  the fix and passes after it. Write it, watch it go red, then fix.
- **Use real fixtures.** New processing pipelines get a real binary file in
  `test-fixtures/`, not a synthetic stub with the right magic bytes. Three live
  bugs got through because a stub looked close enough.
- **Keep `.planning/TEST_PLAN.md` in step.** New tests get an ID there.
- **Never widen the Tauri capabilities** in `src-tauri/capabilities/` without
  saying why in the PR. Each permission is potential file or shell access from
  JavaScript.
- **No secrets in the repo**, including base64-encoded ones. `gitleaks` runs on
  every PR with extra rules for exactly that trick.

## Commit messages

Conventional commits — `fix(editor): …`, `feat(convert): …`, `chore(ci): …`.
Explain *why* in the body, not just what; the diff already says what.
