import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'node:fs';
import ts from 'typescript';

/**
 * [I18N-07] No translated string may be resolved at module load.
 *
 * `t()` reads the active locale at the moment it is called. A call in a module
 * top-level initializer -- `const LABELS = { pdf: t('...') }` -- runs while the
 * module graph is being built, which is long before resolveInitialLocale() has
 * even read the store. It captures English and keeps it forever: switching
 * language re-renders the component, but the constant it reads was computed
 * once and never recomputed.
 *
 * The failure is silent and looks exactly like a missing translation, which is
 * how it was reported -- "DOCUMENT TOOLS was not translated" was a fully
 * translated key frozen in English at import.
 *
 * Every such call must move inside a function so it re-runs per render.
 */
describe('translated strings are resolved at render, not at import', () => {
  const files = globSync('src/**/*.{ts,tsx}', { cwd: process.cwd() })
    .filter((f) => !f.includes('__tests__') && !f.includes(join('src', 'i18n')));

  it('[I18N-07] no t() or plural() call runs at module load', () => {
    const frozen: string[] = [];

    for (const file of files) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );

      const visit = (node: ts.Node, insideFunction: boolean): void => {
        const opensScope =
          ts.isFunctionDeclaration(node) ||
          ts.isFunctionExpression(node) ||
          ts.isArrowFunction(node) ||
          ts.isMethodDeclaration(node) ||
          ts.isGetAccessor(node) ||
          ts.isClassDeclaration(node);

        if (
          !insideFunction &&
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          (node.expression.text === 't' || node.expression.text === 'plural')
        ) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart());
          const key = ts.isStringLiteral(node.arguments[0]) ? node.arguments[0].text : '?';
          frozen.push(`${file}:${line + 1} ${node.expression.text}('${key}')`);
        }

        node.forEachChild((child) => visit(child, insideFunction || opensScope));
      };

      visit(source, false);
    }

    expect(frozen, 'these strings freeze in English at import').toEqual([]);
  });
});
