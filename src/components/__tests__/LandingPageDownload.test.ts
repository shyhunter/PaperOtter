import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * [DOWNLOAD] The landing page hands each visitor the installer their machine
 * can actually run, and asks when it cannot know.
 *
 * Windows has one file, so its button downloads it. macOS and Linux have two
 * apiece and `navigator.userAgent` cannot say which: Apple silicon and Intel are
 * indistinguishable from it, and the Apple silicon .dmg is arm64-only, so an
 * Intel Mac given it gets "PaperOtter is damaged and can't be opened" -- the
 * same words macOS uses for the Gatekeeper refusal, which would send them to the
 * xattr instructions that cannot help. Those two platforms open a chooser.
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
  /** The one-click button. Present only when the platform has a single file. */
  directShown: boolean;
  directHref: string;
  directLabel: string;
  /** The chooser. */
  chooserShown: boolean;
  chooserLabel: string;
  /** Filename of the row marked as the likely one, if any. */
  marked: string | null;
  note: string;
  listed: number;
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
  const direct = d.getElementById('dl-direct') as HTMLAnchorElement;
  const choose = d.getElementById('dl-choose') as HTMLElement;
  const yours = d.querySelector('#dl-all li[data-yours] a');
  const out: Rendered = {
    directShown: !direct.hidden,
    directHref: direct.getAttribute('href') ?? '',
    directLabel: direct.textContent?.trim() ?? '',
    chooserShown: !choose.hidden,
    chooserLabel: d.getElementById('dl-summary')?.textContent?.trim() ?? '',
    marked: yours?.getAttribute('href')?.split('/').pop() ?? null,
    note: d.getElementById('dl-note')?.textContent?.trim() ?? '',
    listed: d.querySelectorAll('#dl-all li').length,
  };
  dom.window.close();
  return out;
}

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const UBUNTU = 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0';

describe('[DOWNLOAD-01] one file means no question', () => {
  it('gives Windows the exe straight away, and hides the chooser', () => {
    const r = render(WINDOWS);
    expect(r.directShown).toBe(true);
    expect(r.directHref).toBe(asset('x64-setup.exe'));
    expect(r.directLabel).toBe('Download for Windows');
    expect(r.chooserShown).toBe(false);
  });
});

describe('[DOWNLOAD-02] two files means it asks', () => {
  it('opens the chooser on a Mac rather than guessing the architecture', () => {
    const r = render(MAC);
    // The whole point: no Mac download starts from one click, because the wrong
    // one produces an error that reads as the signing problem.
    expect(r.directShown).toBe(false);
    expect(r.chooserShown).toBe(true);
    expect(r.chooserLabel).toBe('Download for macOS');
    expect(r.marked).toBe(`PaperOtter_${version}_aarch64.dmg`);
    // The note has to say it is a guess, not state it as fact.
    expect(r.note).toMatch(/cannot tell|2020/i);
  });

  it('opens the chooser on Linux and marks the deb', () => {
    const r = render(UBUNTU);
    expect(r.directShown).toBe(false);
    expect(r.chooserShown).toBe(true);
    expect(r.chooserLabel).toBe('Download for Linux');
    expect(r.marked).toBe(`PaperOtter_${version}_amd64.deb`);
    expect(r.note).toMatch(/AppImage/i);
  });
});

describe('[DOWNLOAD-03] it never points a machine at something it cannot run', () => {
  // Each of these reads as a desktop we ship for if the regexes are naive.
  const PHONES: [string, string][] = [
    ['Android', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'],
    ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'],
    ['iPad (legacy UA)', 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'],
  ];

  it.each(PHONES)('makes no recommendation to %s', (_name, ua) => {
    const r = render(ua);
    expect(r.directShown).toBe(false);
    expect(r.chooserLabel).toBe('Download');
    expect(r.marked).toBeNull();
  });

  it('makes no recommendation on an operating system we do not ship for', () => {
    const r = render('Mozilla/5.0 (PlayStation; PlayStation 5/2.0) AppleWebKit/605.1.15');
    expect(r.directShown).toBe(false);
    expect(r.chooserLabel).toBe('Download');
    expect(r.marked).toBeNull();
  });
});

describe('[DOWNLOAD-04] every build stays reachable', () => {
  it('lists all five whatever the visitor is on', () => {
    // The script marks and promotes; it must never remove. Someone downloading
    // for another machine, or detected wrong, needs the rest to still be there.
    for (const ua of [MAC, WINDOWS, UBUNTU, 'Mozilla/5.0 (Linux; Android 14) Mobile']) {
      expect(render(ua).listed).toBe(5);
    }
  });

  it('is a usable download page with no script at all', () => {
    const d = new JSDOM(html).window.document;
    // The chooser is a native <details>, so it opens unaided. The one-click
    // button is hidden until a script can prove which platform it is for.
    expect((d.getElementById('dl-direct') as HTMLElement).hasAttribute('hidden')).toBe(true);
    expect((d.getElementById('dl-choose') as HTMLElement).tagName).toBe('DETAILS');
    const links = [...d.querySelectorAll('#dl-all li a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual([
      asset('aarch64.dmg'),
      asset('x64.dmg'),
      asset('x64-setup.exe'),
      asset('amd64.deb'),
      asset('amd64.AppImage'),
    ]);
  });
});
