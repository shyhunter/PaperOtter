import { Lock } from 'lucide-react';

export function PrivacyFooter() {
  return (
    <footer className="flex items-center justify-center gap-1.5 py-2 border-t border-border/40 text-muted-foreground">
      <Lock className="h-3 w-3" />
      <span className="text-xs">Processed locally</span>
    </footer>
  );
}
