import { cn } from '@/lib/utils';
import type { ToolStep } from '@/types/tools';
import { t } from '@/i18n';

interface StepBarProps {
  steps: ToolStep[];
  current: number; // 0-based index into the steps array
  /** The job is finished: the step being shown has nothing left to do.
   *
   * Without this the last step is the one step that never goes green, because
   * `current` has nowhere further to go. Save stayed amber while the saved-file
   * confirmation sat underneath it saying the opposite. */
  complete?: boolean;
}

export function StepBar({ steps, current, complete = false }: StepBarProps) {
  return (
    <header className="flex items-center justify-center gap-0 border-b-[3px] border-border bg-background/95 backdrop-blur-sm px-6 py-0 h-14">
      <div className="flex items-center gap-0">
        {steps.map((step, i) => {
          const isActive = i === current && !complete;
          const isComplete = i < current || (complete && i === current);
          const isLocked = i > current;

          return (
            <div key={t(step.label)} className="flex items-center">

              {/* Step item */}
              <div
                data-testid="step-bar-item"
                data-step-index={String(i)}
                data-active={isActive ? 'true' : 'false'}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-md',
                  isActive && 'text-foreground',
                  isComplete && 'text-muted-foreground',
                  isLocked && 'text-muted-foreground/40 cursor-not-allowed',
                )}
                title={isLocked ? t('stepBar.lockedHint', { step: t(step.description) }) : t(step.description)}
              >
                {/* Step number indicator */}
                <span
                  className={cn(
                    'flex h-[clamp(1.4rem,2.2vw,2rem)] w-[clamp(1.4rem,2.2vw,2rem)] items-center justify-center',
                    'border-2 border-border text-[clamp(0.7rem,1vw,1rem)] font-semibold transition-colors',
                    '[border-radius:9px_4px_10px_5px_/_5px_10px_4px_9px]',
                    isActive && 'bg-primary text-primary-foreground',
                    isComplete && 'bg-[var(--lime)] text-foreground',
                    isLocked && 'bg-card text-muted-foreground/40',
                  )}
                >
                  {isComplete ? (
                    // Checkmark for completed steps
                    <svg
                      viewBox="0 0 12 12"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2.2 6.4 Q3.6 7.4 4.8 9.1 Q7 5.2 9.9 2.9" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>

                {/* Step label */}
                <span
                  className={cn(
                    'text-[clamp(0.6rem,0.8vw,0.85rem)] hidden sm:inline',
                    isActive && 'font-medium',
                    isComplete && 'font-normal',
                    isLocked && 'font-normal',
                  )}
                >
                  {t(step.label)}
                </span>
              </div>

              {/* Connector line between steps (not after last) */}
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    'w-8 h-[2px] mx-1 transition-colors',
                    i < current ? 'bg-[var(--lime)]' : 'bg-border/50',
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </header>
  );
}
