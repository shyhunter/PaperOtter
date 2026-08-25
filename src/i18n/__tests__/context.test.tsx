// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, useT } from '@/i18n/context';
import { registerDictionary, resetI18n, setLocale } from '@/i18n';

// ─── i18n React binding (I18N-03) ────────────────────────────────────────────
//
// The lookup itself is module state so non-component code can reach it. The
// provider's job is to make React re-render when the language changes — without
// it, switching language would update the store and leave the whole UI stale.

beforeEach(() => {
  resetI18n();
  registerDictionary('xx', { 'common.cancel': 'ZZcancel', 'common.save': 'ZZsave' });
});
afterEach(() => { cleanup(); resetI18n(); });

function Probe() {
  const { t, locale, setLocale: pick } = useT();
  return (
    <div>
      <span data-testid="text">{t('common.cancel')}</span>
      <span data-testid="locale">{locale}</span>
      <button onClick={() => pick('xx')}>switch</button>
    </div>
  );
}

describe('I18nProvider', () => {
  it('[I18N-03a] renders English by default', () => {
    render(<I18nProvider><Probe /></I18nProvider>);
    expect(screen.getByTestId('text')).toHaveTextContent('Cancel');
    expect(screen.getByTestId('locale')).toHaveTextContent('en');
  });

  it('[I18N-03b] re-renders every consumer when the language changes', async () => {
    const user = userEvent.setup();
    render(<I18nProvider><Probe /></I18nProvider>);

    await user.click(screen.getByRole('button', { name: 'switch' }));

    expect(screen.getByTestId('text')).toHaveTextContent('ZZcancel');
    expect(screen.getByTestId('locale')).toHaveTextContent('xx');
  });

  it('[I18N-03c] re-renders when the language is changed from outside React', async () => {
    // Non-component code shares the same store. If the provider only listened to
    // its own setter, a change made anywhere else would leave the UI stale.
    render(<I18nProvider><Probe /></I18nProvider>);

    await act(async () => { setLocale('xx'); });

    expect(screen.getByTestId('text')).toHaveTextContent('ZZcancel');
  });

  it('[I18N-03d] works without a provider, so no component can crash for lack of one', () => {
    // The store is module-level, so useT outside a provider is still correct —
    // it simply will not re-render on change. Better than throwing during a
    // migration that touches 82 files.
    render(<Probe />);
    expect(screen.getByTestId('text')).toHaveTextContent('Cancel');
  });
});
