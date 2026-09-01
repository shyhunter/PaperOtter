// Whether the finished document meets what the destination asks for.
//
// This is the half of destination presets that answers the question the persona
// actually has. A preset that only pre-fills the controls tells them what to
// set; it does not tell them whether the portal will take the result, which is
// the thing they are anxious about and the thing they find out too late.
//
// Reported per constraint rather than as one pass/fail: "it failed" sends
// someone back to guess, "2.4 MB against a 2 MB limit" does not.
import { Check, X, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import {
  checkDestination,
  destinationName,
  type CheckableResult,
  type CheckStatus,
  type DestinationRequirement,
} from '@/lib/destinations';

const ICONS: Record<CheckStatus, typeof Check> = { met: Check, unmet: X, unknown: Minus };

const TONE: Record<CheckStatus, string> = {
  met: 'text-green-600 dark:text-green-500',
  unmet: 'text-destructive',
  unknown: 'text-muted-foreground',
};

export interface DestinationVerdictProps {
  destination: DestinationRequirement;
  result: CheckableResult;
}

export function DestinationVerdict({ destination, result }: DestinationVerdictProps) {
  const verdict = checkDestination(destination, result);
  if (verdict.constraints.length === 0) return null;

  const name = destinationName(destination);

  return (
    <div
      data-testid="destination-verdict"
      data-meets={verdict.meets}
      className={cn(
        'rounded-md border px-3 py-2 space-y-1.5',
        verdict.meets ? 'border-green-600/40 bg-green-600/5' : 'border-destructive/40 bg-destructive/5',
      )}
    >
      <p className="text-xs font-semibold text-foreground">
        {verdict.meets ? t('destination.meets', { name }) : t('destination.doesNotMeet', { name })}
      </p>
      <ul className="space-y-1">
        {verdict.constraints.map((c) => {
          const Icon = ICONS[c.status];
          return (
            <li key={c.kind} className="flex items-center gap-2 text-xs">
              <Icon className={cn('h-3.5 w-3.5 flex-none', TONE[c.status])} aria-hidden="true" />
              <span className="text-muted-foreground">{c.label}</span>
              {/* The number, not just the tick: someone who is over the limit
                  needs to know by how much before they can decide what to do. */}
              <span className={cn('ms-auto font-medium tabular-nums', TONE[c.status])}>{c.actual}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
