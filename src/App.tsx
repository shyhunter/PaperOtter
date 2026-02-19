import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { LandingCard } from '@/components/LandingCard';
import { useFileDrop } from '@/hooks/useFileDrop';
import { openFilePicker } from '@/hooks/useFileOpen';
import { detectFormat, getFileName } from '@/lib/fileValidation';
import type { FileEntry, AppStep } from '@/types/file';

function App() {
  const [fileEntry, setFileEntry] = useState<FileEntry | null>(null);
  const [currentStep, setCurrentStep] = useState<AppStep>(0);
  const [isLoading, setIsLoading] = useState(false);

  // Called when a file is confirmed (from picker or drop)
  const handleFileSelected = useCallback((filePath: string) => {
    if (!filePath) {
      // Empty string = invalid drop signal from useFileDrop
      toast.error('Unsupported file type', {
        description: 'Please open a PDF, JPG, PNG, or WebP file.',
      });
      return;
    }

    const format = detectFormat(filePath);
    if (!format) {
      toast.error('Unsupported file type', {
        description: 'Please open a PDF, JPG, PNG, or WebP file.',
      });
      return;
    }

    // Brief loading indicator before advancing (locked decision: acknowledge the drop)
    setIsLoading(true);
    setTimeout(() => {
      setFileEntry({ path: filePath, format, name: getFileName(filePath) });
      setIsLoading(false);
      setCurrentStep(1); // Advance to Configure step
    }, 600);
  }, []);

  const dragState = useFileDrop(handleFileSelected);

  const handlePickerClick = useCallback(async () => {
    try {
      const filePath = await openFilePicker();
      if (filePath) {
        handleFileSelected(filePath);
      }
      // null = user cancelled — do nothing
    } catch {
      toast.error('Could not open file picker', {
        description: 'Please try again.',
      });
    }
  }, [handleFileSelected]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* StepBar placeholder — implemented in plan 01-03 */}
      <div className="h-14 border-b border-border flex items-center px-6">
        <span className="text-xs text-muted-foreground">Step bar — plan 01-03</span>
      </div>

      {/* Main content area */}
      {currentStep === 0 && (
        <LandingCard
          dragState={dragState}
          isLoading={isLoading}
          onPickerClick={handlePickerClick}
        />
      )}

      {/* Placeholder for Configure step — Phase 2 */}
      {currentStep > 0 && fileEntry && (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">{fileEntry.name}</p>
            <p className="text-xs text-muted-foreground mt-1">{fileEntry.format} · {fileEntry.path}</p>
            <button
              type="button"
              onClick={() => { setCurrentStep(0); setFileEntry(null); }}
              className="mt-4 text-xs text-primary underline"
            >
              Back to pick
            </button>
          </div>
        </div>
      )}

      <Toaster position="bottom-center" />
    </div>
  );
}

export default App;
