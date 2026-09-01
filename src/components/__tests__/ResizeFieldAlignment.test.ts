import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * [UI-06] The Width and Height fields must sit level with each other.
 *
 * Reported from a real Linux build: in Compress Image → Resize the two fields
 * are side by side, as the two-column grid intends, but one sits lower than the
 * other.
 *
 * The grid was never the problem. The misalignment is inside the columns: the
 * Height label shares a `flex` row with the aspect-ratio lock button, while the
 * Width label was a bare inline `<label>`. A row containing a button is taller
 * than a row containing only text, so the two inputs start at different heights
 * — and the taller side wins by however many pixels the icon and its padding
 * happen to add, which is why this drifts rather than being obviously wrong.
 *
 * Both label rows are now the same element with the same fixed height, so the
 * inputs line up regardless of what either row contains.
 *
 * jsdom computes no CSS and cannot measure a rendered offset, so this scans
 * source in the shape of ScrollContainers.test.ts. It asserts the two columns
 * are built the same way, which is the property that makes them align.
 */

const FILE = 'src/components/ImageConfigureStep.tsx';

/**
 * The row element wrapping each field's label — width first, then height.
 *
 * Anchored on the labels themselves rather than on a comment delimiting the
 * block: the first version of this sliced between source comments, and adding a
 * comment inside the block silently emptied the match.
 */
function labelRowClasses(source: string): string[] {
  return ['width', 'height'].map((field) => {
    const at = source.indexOf('htmlFor={`${formId}-' + field + '`}');
    expect(at, `the ${field} label lost its htmlFor`).toBeGreaterThan(-1);

    const enclosing = [...source.slice(0, at).matchAll(/<div className="([^"]*)">/g)].pop();
    expect(enclosing, `no element wraps the ${field} label`).toBeDefined();
    return enclosing![1];
  });
}

describe('Resize field alignment', () => {
  it('[UI-06a] wraps both labels in the same row element', () => {
    // Not "both contain h-5" separately: identical is the point. Two rows that
    // are each correct in isolation can still differ from each other.
    const rows = labelRowClasses(readFileSync(FILE, 'utf8'));

    expect(rows, 'expected one label row per column').toHaveLength(2);
    expect(rows[0], 'the Width and Height label rows differ').toBe(rows[1]);
  });

  it('[UI-06b] gives that row a fixed height, so its contents cannot set it', () => {
    // The lock button lives in one row and not the other. Without a fixed
    // height the row grows to fit it and that column's input drops.
    const rows = labelRowClasses(readFileSync(FILE, 'utf8'));

    expect(rows[0]).toMatch(/\bh-\d/);
    expect(rows[0]).toContain('items-center');
  });
});
