import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

/**
 * [METAINFO-01] The AppStream metainfo is shipped, and tells the truth.
 *
 * Linux app stores (GNOME Software, KDE Discover, AppImageHub) read this file
 * for the name, description, screenshots and links. Without it AppImageHub
 * showed a screenshot its own test bot took. Most of what it says can go stale
 * silently, so the parts that come from elsewhere are pinned to their source.
 */
const PATH = 'src-tauri/linux/com.paperotter.app.metainfo.xml';
const INSTALLED = '/usr/share/metainfo/com.paperotter.app.metainfo.xml';
const xml = existsSync(PATH) ? readFileSync(PATH, 'utf-8') : '';
const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf-8'));
const tag = (name: string) => xml.match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`))?.[1];

describe('[METAINFO-01] AppStream metainfo', () => {
  it('uses the app identifier as its id, and the real launcher', () => {
    expect(tag('id')).toBe(conf.identifier);
    expect(xml).toContain(`<launchable type="desktop-id">${conf.productName}.desktop</launchable>`);
  });

  it('has what stores need: name, summary, description, licenses', () => {
    expect(tag('name')).toBe(conf.productName);
    expect(tag('summary')).toBeTruthy();
    expect(xml).toMatch(/<description>[\s\S]*<p>[\s\S]+<\/p>[\s\S]*<\/description>/);
    expect(tag('metadata_license')).toBe('CC0-1.0');
    expect(tag('project_license')).toBe('MIT');
  });

  it('links the homepage, the tracker, and the donation page from FUNDING.yml', () => {
    expect(xml).toContain('<url type="homepage">https://shyhunter.github.io/PaperOtter/</url>');
    expect(xml).toContain('<url type="bugtracker">https://github.com/shyhunter/PaperOtter/issues</url>');
    const funding = readFileSync('.github/FUNDING.yml', 'utf-8').match(/https:\/\/[^"\]\s]+/)?.[0];
    expect(xml).toContain(`<url type="donation">${funding}</url>`);
  });

  it('shows screenshots that exist in the repo, over https', () => {
    const shots = [...xml.matchAll(/<image>([^<]+)<\/image>/g)].map((m) => m[1]);
    expect(shots.length).toBeGreaterThan(0);
    for (const url of shots) {
      const prefix = 'https://raw.githubusercontent.com/shyhunter/PaperOtter/main/';
      expect(url.startsWith(prefix)).toBe(true);
      expect(existsSync(url.slice(prefix.length))).toBe(true);
    }
  });

  it('lists the current version as its newest release', () => {
    expect(xml.match(/<release version="([^"]+)"/)?.[1]).toBe(conf.version);
  });

  it('is installed by both the .deb and the AppImage', () => {
    expect(conf.bundle.linux.deb.files[INSTALLED]).toBe('linux/com.paperotter.app.metainfo.xml');
    expect(conf.bundle.linux.appimage.files[INSTALLED]).toBe('linux/com.paperotter.app.metainfo.xml');
  });
});
