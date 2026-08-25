import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import type { ToolId, ToolDefinition } from '@/types/tools';
import { TOOL_REGISTRY } from '@/types/tools';

/** Returns false to veto the navigation, taking on the duty of calling
 * `proceed` later if the user decides to go ahead. */
export type NavigationGuard = (proceed: () => void) => boolean;

interface ToolContextValue {
  activeTool: ToolId | null;        // null = on dashboard
  activeToolDef: ToolDefinition | null;
  pendingFiles: string[];            // file paths dropped on dashboard, forwarded to tool flow
  editorFilePath: string | null;     // non-null = open in full PDF editor
  selectTool: (toolId: ToolId) => void;
  goToDashboard: () => void;
  setPendingFiles: (files: string[]) => void;
  openEditor: (filePath: string) => void;
  /** Register a veto over navigation that would tear down the current view.
   *
   * The guard receives the navigation it is vetoing and returns false to block
   * it, taking responsibility for running `proceed` later (e.g. after asking
   * the user what to do with unsaved changes). Pass null to unregister. */
  setNavigationGuard: (guard: NavigationGuard | null) => void;
}

const ToolContext = createContext<ToolContextValue | null>(null);

export function ToolProvider({ children }: { children: ReactNode }) {
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const [pendingFiles, setPendingFiles] = useState<string[]>([]);
  const [editorFilePath, setEditorFilePath] = useState<string | null>(null);

  // A ref, not state: registering a guard must not re-render, and navigation
  // needs the guard that is current at the moment it is attempted.
  const navigationGuardRef = useRef<NavigationGuard | null>(null);

  const setNavigationGuard = useCallback((guard: NavigationGuard | null) => {
    navigationGuardRef.current = guard;
  }, []);

  const runGuarded = useCallback((proceed: () => void) => {
    if (navigationGuardRef.current && !navigationGuardRef.current(proceed)) return;
    proceed();
  }, []);

  // Both of these tear down whatever is open, discarding its unsaved state, so
  // both go through the guard.
  const selectTool = useCallback((toolId: ToolId) => {
    runGuarded(() => {
      setEditorFilePath(null);
      setActiveTool(toolId);
    });
  }, [runGuarded]);

  const goToDashboard = useCallback(() => {
    runGuarded(() => {
      setActiveTool(null);
      setEditorFilePath(null);
      setPendingFiles([]);
    });
  }, [runGuarded]);

  const openEditor = useCallback((filePath: string) => {
    setActiveTool(null);
    setEditorFilePath(filePath);
  }, []);

  const activeToolDef = useMemo(
    () => (activeTool ? TOOL_REGISTRY[activeTool] : null),
    [activeTool],
  );

  const value = useMemo<ToolContextValue>(
    () => ({ activeTool, activeToolDef, pendingFiles, editorFilePath, selectTool, goToDashboard, setPendingFiles, openEditor, setNavigationGuard }),
    [activeTool, activeToolDef, pendingFiles, editorFilePath, selectTool, goToDashboard, openEditor, setNavigationGuard],
  );

  return <ToolContext.Provider value={value}>{children}</ToolContext.Provider>;
}

export function useToolContext(): ToolContextValue {
  const ctx = useContext(ToolContext);
  if (!ctx) {
    throw new Error('useToolContext must be used within a <ToolProvider>');
  }
  return ctx;
}
