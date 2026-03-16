import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { FeedbackDialog } from '@/components/FeedbackDialog';

export function FeedbackButton() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        title="Send feedback"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
        <span>Feedback</span>
      </button>
      <FeedbackDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  );
}
