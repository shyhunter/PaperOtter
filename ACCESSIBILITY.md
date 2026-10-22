# Accessibility

PaperOtter is a desktop app for compressing, converting and editing PDFs,
images and documents. We want everyone to be able to use it, including people
who use a keyboard instead of a mouse, a screen reader, magnification, high
contrast or reduced motion, and to be able to contribute to it.

This page says what we aim for, what already works, what doesn't yet, and how
to tell us when something gets in your way. If you are reading this because
you hit a barrier: thank you, and please [report it](#reporting-accessibility-issues).
You don't need to know any standards or terminology to do that.

## Priorities

- **Our target:** we work toward
  [WCAG 2.2 Level AA](https://www.w3.org/TR/WCAG22/). This is a goal that guides
  our work. **PaperOtter has not been evaluated against it**, so we don't claim
  that it conforms.
- **Every tool usable without a mouse.** Each tool follows the same steps (pick
  a file, configure, compare, save), and each of those steps should work with
  the keyboard alone, with a visible focus indicator.
- **Screen reader support.** Buttons, fields and dialogs should have clear
  names and announce their state. PaperOtter uses your system's built-in web
  engine, so it works with the screen reader your system already has.
- **Your system settings respected.** The light or dark theme follows your
  system setting unless you choose one yourself, and all animations and
  transitions stop when your system asks for reduced motion.
- **Your language.** The interface is available in English, German, Spanish,
  French, Italian, Dutch, Polish, Portuguese and Turkish, and tells assistive
  technology which language it is in, so screen readers pronounce it correctly.
- **Accessible output.** Where a tool can make a document more accessible, it
  should: *Make Searchable* adds a text layer to scanned PDFs (macOS), so
  screen readers can read them.

## What has been checked

Honestly stated, so you know what to expect:

- **Automated tests** check parts of this: 43 test files find controls by
  their accessible role and name, so they fail if a control loses its name;
  one checks that the interface language is set on the page for assistive
  technology; and one checks that reduced motion stops the loading animation.
- **Not yet done:** an automated accessibility scan (such as axe), a full
  keyboard-only pass over every tool, testing with screen readers, and a
  colour-contrast check of both themes. Until they are, treat the priorities
  above as goals rather than guarantees.

## Known limitations

These are barriers we know about. Each one has a workaround where we know of one.

- **Placing or resizing a signature needs a mouse, trackpad or touch.** You can
  create a signature with the keyboard by typing it, but moving it on the page
  and changing its size can't be done from the keyboard yet.
- **Drawing a redaction box needs a mouse, trackpad or touch.**
  *Workaround:* type the text you want removed into Redact's search box and
  press Enter; every match is marked for redaction.
- **The PDF editor relies on the pointer** for selecting and moving things on
  the page. Its keyboard shortcuts cover Escape, Enter, Delete and saving
  (Ctrl+S or Cmd+S), but not moving objects.
- **Page previews are pictures.** A screen reader can't read the text inside
  the PDF previews or thumbnails. The documents themselves keep their text;
  only the preview is an image.
- **No landmark regions yet.** The app doesn't mark up its main areas (such as
  "main" or "navigation"), so screen reader users can't jump between them and
  move through the app by heading and by control instead.
- **Make Searchable is macOS-only** for now, so the text layer for scanned PDFs
  isn't available on Windows or Linux.

If you find a barrier that isn't listed here, please report it.

## Supported environments

PaperOtter runs on:

| System | Minimum | Built-in screen reader |
|---|---|---|
| macOS | 13 Ventura, with Safari 18 or newer | VoiceOver |
| Windows | Windows 10 | Narrator (NVDA and JAWS also run on Windows) |
| Linux | glibc 2.35 (Ubuntu 22.04, Debian 12, Fedora 36 or newer) | Orca |

PaperOtter draws its interface with the system's own web engine (Safari's on
macOS, Microsoft Edge's WebView2 on Windows, WebKitGTK on Linux), so it
inherits much of that engine's support for assistive technology. **None of the
screen reader combinations above has been systematically tested yet.** Reports
from any of them are especially welcome.

## Reporting accessibility issues

If something gets in your way, please tell us. We treat accessibility reports
as expertise, not complaints.

1. Open an issue with the
   [accessibility issue form](https://github.com/shyhunter/PaperOtter/issues/new?template=accessibility.yml).
2. Include what you can. All of it helps, none of it is required:
   - what you were trying to do, and what happened instead;
   - which tool and which step (pick, configure, compare or save);
   - your operating system, and any assistive technology you use, with
     versions if you know them;
   - a screenshot or recording, only if you're comfortable sharing one.

You never need to tell us about a disability or a diagnosis. If GitHub itself
is hard to use for you, a post in
[Discussions](https://github.com/shyhunter/PaperOtter/discussions) is fine too.

### Severity

You don't need to choose one; we'll assign it when we look at the report.

- **Critical:** you can't complete a task at all (for example, you can't save
  a converted file from the keyboard).
- **Serious:** you can complete it, but only with real difficulty or a
  workaround.
- **Moderate:** it works, but it's confusing, inconsistent or tiring.
- **Minor:** a small issue with little effect on getting things done.

### How we respond

PaperOtter is maintained by a small team, so we promise what we can keep:

- We'll acknowledge your report and thank you for it.
- We'll assign a severity, and explain what we know: the cause if we've found
  it, any limits we can't get around, and a workaround if there is one.
- Critical and serious barriers come before new features.
- We'll post updates on the issue when its status changes, for example
  "we're working on this, tracked in #123".
- We may ask you to confirm that a fix works for you before we close the issue.

## Contributor expectations

If you change anything people interact with, please keep it accessible:

- **Keyboard:** everything you add can be reached with Tab and Shift+Tab, used
  with Enter, Space or the arrow keys as expected, has a visible focus
  indicator, and never traps focus (dialogs, menus and popovers can always be
  left with Escape).
- **Names and states:** every button, field and control has a clear accessible
  name (an icon-only button needs an `aria-label`). Toggles, selections and
  expanded states are exposed (`aria-pressed`, `aria-checked`,
  `aria-expanded`), and progress and errors are announced (`role="status"`,
  `role="alert"`).
- **Not by colour alone:** never use colour as the only way to show a state or
  an error.
- **Motion:** new animations respect reduced motion (`prefers-reduced-motion`).
- **Text:** new interface text goes through the translation system
  (`src/i18n`), so it is translated and correctly labelled with its language.
- **Tests:** prefer component tests that find controls by role and name
  (`getByRole('button', { name: … })`). They fail when a control loses its
  accessible name.
- **In your pull request,** say what you checked: a keyboard-only pass of the
  flow you changed, and a screen reader spot check if you added a new kind of
  control.

Documentation follows the same spirit: a logical heading order, descriptive
link text (not "click here"), real lists, and meaningful alternative text for
images.

There is no automated accessibility check in CI yet. Adding one is welcome.

## Ownership

Accessibility is owned by the maintainer, [@shyhunter](https://github.com/shyhunter),
who triages accessibility reports, keeps track of known barriers, and keeps
this page up to date. The "Known limitations" list above is updated whenever a
barrier is fixed or a new one is confirmed.

## Feedback

Accessibility is ongoing work, not a one-time fix. Suggestions for improving
this page or how we work are welcome as an issue, a pull request or a post in
[Discussions](https://github.com/shyhunter/PaperOtter/discussions). Thank you
for helping make PaperOtter usable by everyone.
