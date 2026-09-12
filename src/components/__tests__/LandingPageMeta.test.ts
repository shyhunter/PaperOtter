import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * [META] The landing page tells a crawler what it is.
 *
 * It did not. The page carried its `<title>` in the body, where an HTML parser
 * leaves it and a link-preview crawler will not look, and it had no Open Graph
 * tags at all — so a link posted to Show HN, Reddit or Slack previewed with no
 * image, no title and no description. The title it did carry was "Trim & Bleed",
 * the design codename, which would also have been the Google result.
 *
 * Everything here is asserted against the parsed document rather than the source
 * text, because the thing that was wrong was *where* the tags were, and grepping
 * cannot tell head from body.
 */

// `@types/jsdom` is not installed; this is the surface the file needs.
type JsdomCtor = new (html: string) => { window: { document: Document } };
const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: JsdomCtor };

const doc = new JSDOM(readFileSync('site/index.html', 'utf-8')).window.document;
const head = doc.head;
const SITE = 'https://shyhunter.github.io/PaperOtter/';

const meta = (sel: string) => head.querySelector(sel)?.getAttribute('content') ?? '';

describe('[META-01] the page is named, in the head', () => {
  it('has exactly one title, and it is not the design codename', () => {
    expect(doc.querySelectorAll('title')).toHaveLength(1);
    expect(head.querySelector('title'), 'the title is outside <head>').toBeTruthy();
    expect(doc.title).toMatch(/PaperOtter/);
    expect(doc.title).not.toMatch(/Trim/i);
  });

  it('carries a description and a canonical URL', () => {
    expect(meta('meta[name="description"]').length).toBeGreaterThan(60);
    expect(head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(SITE);
  });

  it('has a favicon, so the tab is not blank', () => {
    expect(head.querySelector('link[rel="icon"]')).toBeTruthy();
    expect(head.querySelector('link[rel="apple-touch-icon"]')).toBeTruthy();
  });
});

describe('[META-02] a shared link previews with something', () => {
  it('declares the Open Graph set in the head', () => {
    for (const prop of ['og:type', 'og:title', 'og:description', 'og:url', 'og:image']) {
      expect(meta(`meta[property="${prop}"]`), `${prop} missing from <head>`).not.toBe('');
    }
  });

  it('gives an absolute image URL', () => {
    // A relative one is meaningless to a crawler fetching the page from
    // somewhere else: it is the single most common way this silently breaks.
    const img = meta('meta[property="og:image"]');
    expect(img.startsWith('https://'), `og:image is not absolute: ${img}`).toBe(true);
    expect(img).toContain('share-card');
  });

  it('states the image dimensions it actually ships', () => {
    // The card is 1200x630. Declaring anything else makes a preview crop wrong.
    expect(meta('meta[property="og:image:width"]')).toBe('1200');
    expect(meta('meta[property="og:image:height"]')).toBe('630');
  });

  it('asks for a large Twitter card rather than a thumbnail', () => {
    expect(meta('meta[name="twitter:card"]')).toBe('summary_large_image');
    expect(meta('meta[name="twitter:image"]').startsWith('https://')).toBe(true);
  });
});
