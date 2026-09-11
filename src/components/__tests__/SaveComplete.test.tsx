// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StepBar } from '@/components/StepBar';
import type { ToolStep } from '@/types/tools';

afterEach(cleanup);

const STEPS: ToolStep[] = [
  { label: 'step.pick', description: 'tool.compressPdf.step1' },
  { label: 'step.configure', description: 'tool.compressPdf.step2' },
  { label: 'step.compare', description: 'tool.compressPdf.step3' },
  { label: 'step.save', description: 'tool.compressPdf.step4' },
];

/** A step shows a tick instead of its number once it is done. */
function isDone(index: number): boolean {
  const item = screen.getAllByTestId('step-bar-item')[index];
  return item.querySelector('svg') !== null;
}

/**
 * [UI-STEP-01] Save is the last step, so `current` never moves past it and it
 * was the one step that could never go green. It sat amber while the
 * saved-file confirmation underneath it said the job was finished.
 */
describe('[UI-STEP-01] the last step can finish', () => {
  it('leaves the current step active while there is still work to do', () => {
    render(<StepBar steps={STEPS} current={3} />);

    expect(isDone(0)).toBe(true);
    expect(isDone(1)).toBe(true);
    expect(isDone(2)).toBe(true);
    expect(isDone(3), 'Save is still in progress').toBe(false);
    expect(screen.getAllByTestId('step-bar-item')[3]).toHaveAttribute('data-active', 'true');
  });

  it('turns the last step green once the file is saved', () => {
    render(<StepBar steps={STEPS} current={3} complete />);

    expect(isDone(3), 'Save should read as done').toBe(true);
    expect(screen.getAllByTestId('step-bar-item')[3]).toHaveAttribute('data-active', 'false');
  });

  it('marks it complete with the same green every other finished step uses', () => {
    render(<StepBar steps={STEPS} current={3} complete />);

    const items = screen.getAllByTestId('step-bar-item');
    const swatch = (i: number) => items[i].querySelector('span')?.className ?? '';

    // Not a new colour for the last step: the bar reads as one sequence.
    expect(swatch(3)).toContain('bg-[var(--lime)]');
    expect(swatch(3).replace(/\s+/g, ' ')).toBe(swatch(0).replace(/\s+/g, ' '));
  });
});
