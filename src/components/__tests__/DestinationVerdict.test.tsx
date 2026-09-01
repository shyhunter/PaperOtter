// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DestinationVerdict } from '@/components/destinations/DestinationVerdict';
import type { DestinationRequirement } from '@/lib/destinations';

/**
 * [DEST-UI] The verdict is the feature.
 *
 * A destination preset that only pre-fills the controls answers "what settings
 * do I need". The persona's question is "will the portal take this", and that
 * is answered here, against the finished document, at the moment before they
 * save it and go back to the form.
 */

const MB = 1024 * 1024;
const A4 = { widthPt: 595.28, heightPt: 841.89 };
const DEST: DestinationRequirement = { id: 'd', name: 'Under 2 MB, A4', maxBytes: 2 * MB, pageSize: 'A4' };

afterEach(cleanup);

describe('DestinationVerdict', () => {
  it('[DEST-UI-01] states a pass, and shows the numbers behind it', () => {
    render(<DestinationVerdict destination={DEST} result={{ outputSizeBytes: 1.4 * MB, pageCount: 4, outputPageDimensions: A4 }} />);

    expect(screen.getByTestId('destination-verdict')).toHaveAttribute('data-meets', 'true');
    expect(screen.getByText(/Under 2 MB, A4/)).toBeInTheDocument();
    // The measured value, not just a tick: it is what makes the claim checkable.
    expect(screen.getByText('1.40 MB')).toBeInTheDocument();
  });

  it('[DEST-UI-02] a failure names the constraint that failed and by how much', () => {
    render(<DestinationVerdict destination={DEST} result={{ outputSizeBytes: 2.4 * MB, pageCount: 4, outputPageDimensions: A4 }} />);

    const verdict = screen.getByTestId('destination-verdict');
    expect(verdict).toHaveAttribute('data-meets', 'false');
    // "It failed" sends someone back to guess. The size does not.
    expect(screen.getByText('2.40 MB')).toBeInTheDocument();
    // "A4" twice on purpose: what was asked for, and what was produced. The
    // page constraint passed while the size one did not, which is exactly the
    // distinction the per-constraint report exists to make.
    expect(screen.getAllByText('A4')).toHaveLength(2);
  });

  it('[DEST-UI-03] shows what it could not check as unchecked, not as a pass', () => {
    render(<DestinationVerdict destination={DEST} result={{ outputSizeBytes: MB, pageCount: 1, outputPageDimensions: null }} />);

    expect(screen.getByTestId('destination-verdict')).toHaveAttribute('data-meets', 'false');
    expect(screen.getByText(/not checked/i)).toBeInTheDocument();
  });

  it('[DEST-UI-04] renders nothing for a destination that checks nothing', () => {
    // Better an absent panel than one asserting conformance to no requirements.
    render(<DestinationVerdict destination={{ id: 'x', name: 'Nothing' }} result={{ outputSizeBytes: MB, pageCount: 1, outputPageDimensions: A4 }} />);
    expect(screen.queryByTestId('destination-verdict')).toBeNull();
  });
});
