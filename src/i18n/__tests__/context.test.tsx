// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocale, useT } from '@/i18n/context';
import { registerDictionary, resetI18n, setLocale, t as bareT } from '@/i18n';

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

// A component that calls the module-level t() directly, with no hook of its own.
// This is how the other 82 components are written.
function BareProbe() {
  return <span data-testid="bare">{bareT('common.cancel')}</span>;
}

// The root subscribes and builds the tree, which is what makes BareProbe update.
function Root() {
  useLocale();
  return <BareProbe />;
}

// A wrapper that subscribes but only forwards `children` — the shape that looks
// right and silently does not work.
function PassThroughWrapper({ children }: { children: React.ReactNode }) {
  useLocale();
  return <>{children}</>;
}

describe('locale re-rendering', () => {
  it('[I18N-03e] a root that subscribes re-renders bare t() descendants', async () => {
    // The guarantee the whole extraction rests on. If this breaks, every string
    // in the app goes stale on language change and nothing else would catch it.
    render(<Root />);
    expect(screen.getByTestId('bare')).toHaveTextContent('Cancel');

    await act(async () => { setLocale('xx'); });

    expect(screen.getByTestId('bare')).toHaveTextContent('ZZcancel');
  });

  it('[I18N-03f] documents why a children-forwarding provider is not enough', async () => {
    // `children` is the same element reference every render, so React bails out
    // of the subtree. This test exists so nobody "simplifies" useLocale back into
    // a <Provider>{children}</Provider> and leaves the UI stale in every language
    // but English — a failure that would not appear until F13b.
    render(<PassThroughWrapper><BareProbe /></PassThroughWrapper>);

    await act(async () => { setLocale('xx'); });

    expect(screen.getByTestId('bare')).toHaveTextContent('Cancel');
  });

  it('[I18N-03a] renders English by default', () => {
    render(<Probe />);
    expect(screen.getByTestId('text')).toHaveTextContent('Cancel');
    expect(screen.getByTestId('locale')).toHaveTextContent('en');
  });

  it('[I18N-03b] re-renders every consumer when the language changes', async () => {
    const user = userEvent.setup();
    render(<Probe />);

    await user.click(screen.getByRole('button', { name: 'switch' }));

    expect(screen.getByTestId('text')).toHaveTextContent('ZZcancel');
    expect(screen.getByTestId('locale')).toHaveTextContent('xx');
  });

  it('[I18N-03c] re-renders when the language is changed from outside React', async () => {
    // Non-component code shares the same store. If the provider only listened to
    // its own setter, a change made anywhere else would leave the UI stale.
    render(<Probe />);

    await act(async () => { setLocale('xx'); });

    expect(screen.getByTestId('text')).toHaveTextContent('ZZcancel');
  });

  it('[I18N-03d] needs no provider to wrap it', () => {
    // The store is module-level, so useT works anywhere. During a migration
    // touching 82 files, a hook that throws for a missing wrapper turns an
    // oversight into a blank screen.
    render(<Probe />);
    expect(screen.getByTestId('text')).toHaveTextContent('Cancel');
  });
});
