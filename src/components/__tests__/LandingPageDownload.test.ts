import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

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

/**
 * [DOWNLOAD] The landing page hands each visitor the installer their machine
 * can actually open.
 *
 * The page carries all five builds in its markup and a script promotes the one
 * matching the visitor into the primary button. That script reads
 * `navigator.userAgent`, which is a minefield: Android's contains "Linux" and
 * iOS's contains Mac-like tokens, so the obvious regexes hand a phone a `.deb`
 * or a `.dmg`. Asserting on the source would not have caught that — this runs
 * the page's own script against real user-agent strings and reads the result
 * off the DOM.
 */

const html = readFileSync('site/index.html', 'utf-8');
const version = (
  JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf-8')) as { version: string }
).version;

const asset = (suffix: string) =>
  `https://github.com/shyhunter/PaperOtter/releases/download/v${version}/PaperOtter_${version}_${suffix}`;

interface Rendered {
  label: string;
  href: string;
  note: string;
  listed: number;
}

function render(userAgent: string): Rendered {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    beforeParse(w) {
      // jsdom has neither, and the page's other scripts use both. Without them
      // the stage script throws before the download script is reached.
      Object.defineProperty(w.navigator, 'userAgent', { value: userAgent, configurable: true });
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
    note: d.getElementById('dl-note')?.textContent?.trim() ?? '',
    listed: d.querySelectorAll('#dl-all li').length,
  };
  dom.window.close();
  return out;
}

const RELEASES = 'https://github.com/shyhunter/PaperOtter/releases/latest';

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const UBUNTU = 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0';

describe('[DOWNLOAD-01] the button follows the machine', () => {
  it('gives a Mac the Apple silicon dmg, and says that is the assumption', () => {
    const r = render(MAC);
    expect(r.href).toBe(asset('aarch64.dmg'));
    expect(r.label).toBe('Download for macOS');
    // Apple silicon and Intel cannot be told apart from the user agent, so the
    // note has to name the guess rather than let someone take the wrong file.
    expect(r.note).toMatch(/Intel Mac/i);
  });

  it('gives Windows the exe', () => {
    const r = render(WINDOWS);
    expect(r.href).toBe(asset('x64-setup.exe'));
    expect(r.label).toBe('Download for Windows');
  });

  it('gives Linux the deb, and points at the AppImage', () => {
    const r = render(UBUNTU);
    expect(r.href).toBe(asset('amd64.deb'));
    expect(r.label).toBe('Download for Linux');
    expect(r.note).toMatch(/AppImage/i);
  });
});

describe('[DOWNLOAD-02] it never hands out an installer that cannot run', () => {
  // Each of these reads as a desktop we ship for if the regexes are naive.
  const PHONES: [string, string][] = [
    ['Android', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'],
    ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'],
    ['iPad (legacy UA)', 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'],
  ];

  it.each(PHONES)('leaves %s on the releases page', (_name, ua) => {
    const r = render(ua);
    expect(r.href).toBe(RELEASES);
    expect(r.label).toBe('Download');
  });

  it('leaves an operating system we do not ship for alone', () => {
    const r = render('Mozilla/5.0 (PlayStation; PlayStation 5/2.0) AppleWebKit/605.1.15');
    expect(r.href).toBe(RELEASES);
    expect(r.label).toBe('Download');
  });
});

describe('[DOWNLOAD-03] the full list survives detection', () => {
  it('still shows every build, whatever the visitor is on', () => {
    // The script promotes; it must never remove. Someone downloading for another
    // machine, or detected wrong, needs the alternatives to still be there.
    for (const ua of [MAC, WINDOWS, UBUNTU, 'Mozilla/5.0 (Linux; Android 14) Mobile']) {
      expect(render(ua).listed).toBe(5);
    }
  });

  it('works with no script at all', () => {
    // The markup alone has to be a usable download page.
    const d = new JSDOM(html).window.document;
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
