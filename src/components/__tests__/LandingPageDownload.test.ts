import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * [DOWNLOAD] The landing page hands each visitor the installer their machine
 * can actually run, and asks when it cannot know.
 *
 * Windows has one file, so the hero button downloads it. macOS and Linux have
 * two apiece and `navigator.userAgent` cannot say which: Apple silicon and Intel
 * are indistinguishable from it, and the Apple silicon .dmg is arm64-only, so an
 * Intel Mac given it gets "PaperOtter is damaged and can't be opened" -- the
 * same words macOS uses for the Gatekeeper refusal, which would send them to the
 * xattr instructions that cannot help. For those two the button jumps to the
 * cards under the demo instead, where the likely build carries a stamp.
 *
 * The user agent is also a minefield in the other direction: Android's contains
 * "Linux" and iOS's contains Mac-like tokens. Asserting on the source would not
 * catch that, so this runs the page's own script against real strings and reads
 * the result off the DOM.
 */

// jsdom is a declared devDependency, but `@types/jsdom` is not installed and
// this is the only place it is imported directly. Rather than add a package
// during a release, the surface this file actually uses is spelled out here.
interface JsdomWindow {
  document: Document;
  navigator: Navigator;
  HTMLMediaElement: { prototype: { play: () => Promise<void> } };
  close: () => void;
}
interface JsdomOptions {
  runScripts?: 'dangerously';
  beforeParse?: (window: JsdomWindow) => void;
}
type JsdomCtor = new (html: string, options?: JsdomOptions) => { window: JsdomWindow };

const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: JsdomCtor };

const html = readFileSync('site/index.html', 'utf-8');
const version = (
  JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf-8')) as { version: string }
).version;

const asset = (suffix: string) =>
  `https://github.com/shyhunter/PaperOtter/releases/download/v${version}/PaperOtter_${version}_${suffix}`;

interface Rendered {
  /** The hero button. */
  label: string;
  href: string;
  /** True when the button jumps to the cards instead of downloading. */
  jumps: boolean;
  note: string;
  /** Platform of the card carrying the "probably yours" stamp, if any. */
  stamped: string | null;
  cards: number;
  links: number;
}

function render(userAgent: string): Rendered {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    beforeParse(w) {
      // The JSDOM userAgent option did not take effect here, so it is set on
      // navigator directly -- otherwise every case reads jsdom's own "(darwin)"
      // string, matches no platform, and the test proves nothing.
      Object.defineProperty(w.navigator, 'userAgent', { value: userAgent, configurable: true });
      // jsdom has neither, and the page's other scripts use both. Without them
      // the stage script throws before the download script is reached.
      w.HTMLMediaElement.prototype.play = () => Promise.resolve();
      (w as unknown as { matchMedia: (q: string) => unknown }).matchMedia = (q: string) => ({
        matches: false,
        media: q,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
      });
    },
  });
  const d = dom.window.document;
  const btn = d.getElementById('dl') as HTMLAnchorElement;
  const out: Rendered = {
    label: btn.textContent?.trim() ?? '',
    href: btn.getAttribute('href') ?? '',
    jumps: btn.hasAttribute('data-jump'),
    note: d.getElementById('dl-note')?.textContent?.trim() ?? '',
    stamped: d.querySelector('.get-card[data-here]')?.getAttribute('data-os') ?? null,
    cards: d.querySelectorAll('.get-card').length,
    links: d.querySelectorAll('.get-card a').length,
  };
  dom.window.close();
  return out;
}

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const UBUNTU = 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0';

describe('[DOWNLOAD-01] one file means the button is the download', () => {
  it('gives Windows the exe straight from the hero', () => {
    const r = render(WINDOWS);
    expect(r.href).toBe(asset('x64-setup.exe'));
    expect(r.label).toBe('Download for Windows');
    expect(r.jumps).toBe(false);
    expect(r.stamped).toBe('windows');
  });
});

describe('[DOWNLOAD-02] two files means the button sends you to the cards', () => {
  it('does not pick a Mac architecture', () => {
    const r = render(MAC);
    // The point of the whole design: no Mac download starts from one click,
    // because the wrong build reports itself as the signing problem.
    expect(r.href).toBe('#get');
    expect(r.jumps).toBe(true);
    expect(r.label).toBe('Download for macOS');
    expect(r.stamped).toBe('mac');
    expect(r.note).toMatch(/cannot tell/i);
  });

  it('does not pick a Linux package', () => {
    const r = render(UBUNTU);
    expect(r.href).toBe('#get');
    expect(r.jumps).toBe(true);
    expect(r.label).toBe('Download for Linux');
    expect(r.stamped).toBe('linux');
  });
});

describe('[DOWNLOAD-03] it never claims a build is yours when it cannot run', () => {
  // Each of these reads as a desktop we ship for if the regexes are naive.
  const PHONES: [string, string][] = [
    ['Android', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'],
    ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'],
    ['iPad (legacy UA)', 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'],
  ];

  it.each(PHONES)('stamps no card for %s', (_name, ua) => {
    const r = render(ua);
    expect(r.stamped).toBeNull();
    expect(r.label).toBe('Download');
    expect(r.href).toBe('#get');
  });

  it('stamps no card on an operating system we do not ship for', () => {
    const r = render('Mozilla/5.0 (PlayStation; PlayStation 5/2.0) AppleWebKit/605.1.15');
    expect(r.stamped).toBeNull();
    expect(r.label).toBe('Download');
  });
});

describe('[DOWNLOAD-04] every build stays visible', () => {
  it('shows all three cards and all five builds, whatever the visitor is on', () => {
    // The script stamps; it must never hide. Someone downloading for another
    // machine, or detected wrong, needs the rest to still be there -- and the
    // cards sit under the demo precisely so nothing is ever covered up.
    for (const ua of [MAC, WINDOWS, UBUNTU, 'Mozilla/5.0 (Linux; Android 14) Mobile']) {
      const r = render(ua);
      expect(r.cards).toBe(3);
      expect(r.links).toBe(5);
    }
  });

  it('is a usable download page with no script at all', () => {
    const d = new JSDOM(html).window.document;
    expect((d.getElementById('dl') as HTMLAnchorElement).getAttribute('href')).toBe('#get');
    const links = [...d.querySelectorAll('.get-card a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual([
      asset('aarch64.dmg'),
      asset('x64.dmg'),
      asset('x64-setup.exe'),
      asset('amd64.deb'),
      asset('amd64.AppImage'),
    ]);
  });
});
