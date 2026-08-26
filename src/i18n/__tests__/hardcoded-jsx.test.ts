import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import ts from 'typescript';

/**
 * [I18N-08] No user-visible English literal outside the dictionaries.
 *
 * The original extraction pass matched whole JSX text nodes, so it missed every
 * sentence that wrapped an expression -- `This will create {n} files.` reads as
 * three fragments, none of which look like a sentence. Around a hundred strings
 * survived that way, including redaction copy that tells the user their content
 * is being destroyed. This is what catches the next one.
 *
 * Scope: JSX text, the attributes a screen reader or tooltip reads out, and
 * template literals that are not obviously markup. className/style/testid
 * templates and diagLog/console/Error arguments are not user copy and are
 * skipped.
 *
 * This does NOT replace I18N-04 in no-hardcoded-strings.test.ts. That one reads
 * source as text and covers shapes this does not -- toast() calls, `description:`
 * and `label:` properties, error setters, ternary fallbacks. This one parses the
 * AST and covers what a text scan cannot see: a sentence split across JSX
 * expressions. The two are complementary, and both are needed.
 */
describe('user-visible text comes from the dictionary', () => {
  /**
   * Literals that are correct as English, with the reason each one is exempt.
   * Anything added here should be a proper noun or a symbol, never a sentence.
   */
  const ALLOWED = new Set([
    'Papercut',        // the product name; not translated in any language
    'Tauri + React',   // technology names, shown in the About dialog
    'GitHub',          // proper noun
    '1, 2, 3',         // numeral-format examples -- the glyphs are the content
    'i, ii, iii',
    'A, B, C',
  ]);

  const ATTRS = new Set(['title', 'aria-label', 'placeholder', 'alt']);
  const files = globSync('src/**/*.tsx').filter((f) => !f.includes('__tests__'));

  it('[I18N-08] no hardcoded English in JSX text, labels or templates', () => {
    const found: string[] = [];

    for (const file of files) {
      const source = ts.createSourceFile(
        file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
      );
      const lineOf = (n: ts.Node) => source.getLineAndCharacterOfPosition(n.getStart()).line + 1;
      // At least one lowercase word: filters out "PDF", "A4", "72 dpi".
      const readsAsEnglish = (s: string) => /[A-Za-z][a-z]{2,}/.test(s);
      const report = (n: ts.Node, text: string) => {
        const clean = text.trim().replace(/\s+/g, ' ');
        if (!clean || ALLOWED.has(clean) || !readsAsEnglish(clean)) return;
        found.push(`${file}:${lineOf(n)} ${clean.slice(0, 60)}`);
      };

      // A template inside markup plumbing, a log, or an Error is not user copy.
      const isPlumbing = (n: ts.Node) => {
        for (let p = n.parent; p; p = p.parent) {
          if (ts.isJsxAttribute(p) && /^(className|style|key|id|htmlFor|href|src|name|value|type|data-\w+)$/
            .test(p.name.getText())) return true;
          if (ts.isCallExpression(p) && /diagLog|console|Error|invoke|join|writeFile|encodeURIComponent/
            .test(p.expression.getText())) return true;
        }
        return false;
      };

      /**
       * Templates carry a lot that is not prose: output filenames
       * (`${base}-optimised.pdf`), element ids, MIME types, mailto URLs, Tailwind
       * class lists assembled in a helper, and the markdown crash report, which
       * is addressed to the maintainer and stays English on purpose. Requiring
       * two words either side of a space keeps those out while still catching
       * any real sentence.
       */
      const isClassList = (s: string) =>
        s.split(' ').every((token) => /^[a-z0-9][a-z0-9:/[\]._-]*$/.test(token));

      const readsAsProse = (s: string) =>
        / /.test(s) && /[A-Za-z]{2,}\s+[a-z]{2,}/.test(s) && !isClassList(s) &&
        !/```|mailto:|^image\/|^[-\w]+\/[-\w]+$/.test(s);

      const visit = (node: ts.Node): void => {
        if (ts.isJsxText(node)) report(node, node.text);

        if (ts.isJsxAttribute(node) && ATTRS.has(node.name.getText()) && node.initializer) {
          const init = node.initializer;
          const literal = ts.isStringLiteral(init) ? init
            : ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression)
              ? init.expression : null;
          if (literal) report(node, literal.text);
        }

        if (ts.isTemplateExpression(node) && !isPlumbing(node)) {
          const literalParts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)]
            .join(' ').trim().replace(/\s+/g, ' ');
          if (readsAsProse(literalParts)) report(node, literalParts);
        }

        node.forEachChild(visit);
      };
      visit(source);
    }

    expect(found, 'these strings are English for every user').toEqual([]);
  });
});
