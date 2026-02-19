import { cn } from '@/lib/utils';
import type { AppStep } from '@/types/file';

const STEPS = [
  { label: 'Pick', description: 'Open a file' },
  { label: 'Configure', description: 'Set options' },
  { label: 'Compare', description: 'Review output' },
  { label: 'Save', description: 'Save to disk' },
] as const;

interface StepBarProps {
  current: AppStep; // 0 = Pick, 1 = Configure, 2 = Compare, 3 = Save
}

export function StepBar({ current }: StepBarProps) {
  return (
    <header className="flex items-center justify-center gap-0 border-b border-border bg-background/95 backdrop-blur-sm px-6 py-0 h-14">
      <div className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const isActive = i === current;
          const isComplete = i < current;
          const isLocked = i > current;

          return (
            <div key={step.label} className="flex items-center">

              {/* Step item */}
              <div
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-md',
                  isActive && 'text-foreground',
                  isComplete && 'text-muted-foreground',
                  isLocked && 'text-muted-foreground/40 cursor-not-allowed',
                )}
                title={isLocked ? `${step.description} — complete previous steps first` : step.description}
              >
                {/* Step number indicator */}
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                    isActive && 'bg-primary text-primary-foreground',
                    isComplete && 'bg-primary/20 text-primary',
                    isLocked && 'bg-muted/60 text-muted-foreground/40',
                  )}
                >
                  {isComplete ? (
                    // Checkmark for completed steps
                    <svg
                      viewBox="0 0 12 12"
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="2,6 5,9 10,3" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>

                {/* Step label */}
                <span
                  className={cn(
                    'text-sm hidden sm:inline',
                    isActive && 'font-medium',
                    isComplete && 'font-normal',
                    isLocked && 'font-normal',
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line between steps (not after last) */}
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    'w-8 h-px mx-1 transition-colors',
                    i < current ? 'bg-primary/40' : 'bg-border',
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
