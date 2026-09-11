import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The reported batch, each pinned where it actually broke.
 *
 * These are shape checks rather than behaviour, because every one of them is a
 * wiring mistake that no amount of clicking in a browser would have caught: a
 * hook imported from a library that is not mounted, a colour that composites to
 * the page it sits on, a button whose handler does nothing.
 */

const read = (f: string) => readFileSync(f, 'utf-8');

describe('[TOAST-01] the toast follows the app, not the operating system', () => {
  const src = read('src/components/ui/sonner.tsx');

  it('takes its theme from the app', () => {
    // It read `useTheme` from next-themes, whose provider the app never mounts.
    // The hook returned nothing, the `"system"` default took over, and sonner
    // resolved that against prefers-color-scheme -- so a Mac in dark mode with
    // PaperOtter in light mode got sonner's dark description colour,
    // hsl(0,0%,91%), on our light popover. The second line was invisible.
    // Code lines only: the comment above the fix names the library it replaced,
    // and a whole-file scan would read that explanation as the bug.
    const code = src.split('\n').filter((l) => {
      const t = l.trimStart();
      return t !== '' && !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
    });
    expect(code.filter((l) => l.includes('next-themes')), 'not mounted in this app').toEqual([]);
    expect(src).toContain("from '@/hooks/useTheme'");
  });

  it('can be dismissed without waiting for it', () => {
    expect(src, 'a toast that covers something needs a way out').toContain('closeButton');
  });

  it('is lifted clear of the action bar it used to land on', () => {
    const app = read('src/App.tsx');
    const offset = app.match(/<Toaster[^>]*offset=\{(\d+)\}/);
    expect(offset, 'no offset: it sits on the button that raised it').not.toBeNull();
    expect(Number(offset![1])).toBeGreaterThanOrEqual(120);
  });

  it('is drawn like everything else here', () => {
    const css = read('src/styles/globals.css');
    expect(css).toMatch(/\[data-sonner-toast\][\s\S]{0,200}border-radius:[^;]*\//);
    expect(css, 'the description colour has to come from our token').toMatch(
      /\[data-sonner-toast\] \[data-description\][\s\S]{0,80}var\(--muted-foreground\)/,
    );
  });
});

describe('[PICK-CONTRAST-01] a chosen option is visible on a light page', () => {
  it('lifts the selected tint, and only the selected one', () => {
    // Thirty-seven controls mark "chosen" as border-primary plus a 5-10% tint
    // of the brand yellow. On a page at oklch(0.994 ...) that composites to
    // within a couple of levels of the paper.
    const css = read('src/styles/globals.css');
    expect(css).toMatch(/:root:not\(\.dark\) \.border-primary\.bg-primary\\\/5/);
    expect(css).toMatch(/:root:not\(\.dark\) \.border-primary\.bg-primary\\\/10/);
    // Paired with border-primary so it cannot leak onto hover states and drag
    // overlays, which use the same tints to mean something much weaker.
    const rule = css.slice(css.indexOf(':root:not(.dark) .border-primary'));
    expect(rule.slice(0, 400)).not.toMatch(/:root:not\(\.dark\) \.bg-primary\\\/\d+ \{/);
  });
});

describe('[SAVE-DONE-01] the last step says what is left to do', () => {
  const src = read('src/components/SaveStep.tsx');

  it('offers nothing more after a save that replaced the file', () => {
    // "Save Again" re-wrote the same bytes to the same path.
    expect(src).toContain("const savedInPlace = lastMode === 'replace'");
    expect(src).toMatch(/disabled=\{savedInPlace\}/);
    expect(src).toMatch(/savedInPlace \? t\('save\.saved'\) : t\('save\.copy'\)/);
  });

  it('still retries a failed replace as a replace', () => {
    // Retrying a read-only failure must not quietly become a Save as.
    expect(src).toContain("const repeatSave = lastMode === 'replace' ? handleReplace : handleSave;");
  });
});

describe('[CROP-01] Crop names the document it is cropping', () => {
  it('shows the file name and its size beside the page size', () => {
    const src = read('src/components/crop-pdf/CropPdfFlow.tsx');
    expect(src).toContain('data-testid="crop-file-name"');
    expect(src).toMatch(/formatBytes\(pdfBytes\?\.byteLength/);
  });

  it('offers the same margin presets as the editor, from one list', () => {
    // The editor had per-side numbers but no presets, so reaching a plain 10mm
    // border meant typing 10 four times.
    expect(read('src/components/crop-pdf/CropPdfFlow.tsx')).toContain('cropMarginPresets()');
    expect(read('src/components/pdf-editor/ToolSidebarPanel.tsx')).toContain('cropMarginPresets()');
  });
});

describe('[LOAD-01] reading a file is visible', () => {
  it('shows the loader, not a hairline bar', () => {
    // Crop PDF spends seconds parsing before the first page can be measured,
    // and the only sign of it was a 1.5px pulsing bar below the fold.
    const src = read('src/components/LandingCard.tsx');
    expect(src).toContain('<OtterLoader');
    expect(src, 'the old bar is gone').not.toContain('animate-pulse');
  });
});

describe('[SIGN-PICK-01] the Place step can change its mind', () => {
  it('lists the saved signatures and switches between them', () => {
    // The only way to use a different saved signature was to go back, and the
    // list was not visible from here, so there was nothing to go back to that
    // you could see first.
    const src = read('src/components/sign-pdf/SignaturePlaceStep.tsx');
    expect(src).toContain('useSavedSignatures');
    expect(src).toContain('data-testid="place-saved-signature"');
    expect(src, 'the chosen one drives the preview and the output')
      .toContain('setActiveDataUrl');
  });
});

describe('[PRIVACY-01] the app says what it actually fetches', () => {
  it('describes the second endpoint as the discussion board', () => {
    // It fetches feedback-config.json, which carries a GitHub Discussions URL.
    // Every locale called it a contact address, from when feedback was email.
    const feedback = read('src/lib/feedbackConfig.ts');
    expect(feedback).toContain('discussions');

    for (const loc of ['en', 'de', 'es', 'it', 'fr', 'pt', 'nl', 'pl', 'tr']) {
      const line = read(`src/i18n/${loc}.ts`)
        .split('\n')
        .find((l) => l.includes('privacy.detailNetworkScope'));
      expect(line, `${loc} has no network-scope line`).toBeDefined();
      expect(line!.toLowerCase(), `${loc} still calls it a contact address`)
        .not.toMatch(/contact address|kontaktadresse|adresse de contact|indirizzo di contatto|dirección de contacto|contactadres|endereço de contacto|adres kontaktowy|iletişim adresi/);
    }
  });
});
