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
  /** Swap the document the current tool is working on, without leaving the tool. */
  replaceDocument: (filePath: string) => void;
  /** Bumped by replaceDocument. Flows are keyed on it so they remount: each keeps
   *  its own step and bytes in local state and reads pendingFiles only once, so
   *  nothing short of a remount makes a flow past step one take a new file. */
  documentEpoch: number;
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

  // Guarded like the other two: replacing the open document tears down the
  // editor and discards its unsaved edits just as surely as leaving for the
  // dashboard does. This was reachable before anything in the UI offered it --
  // double-clicking a PDF in Finder while the editor was dirty came through
  // here and threw the edits away without asking.
  const [documentEpoch, setDocumentEpoch] = useState(0);

  const replaceDocument = useCallback((filePath: string) => {
    setPendingFiles([filePath]);
    // Counter rather than the path: re-choosing the file a flow has already
    // mangled has to give a clean one too.
    setDocumentEpoch((n) => n + 1);
  }, []);

  const openEditor = useCallback((filePath: string) => {
    runGuarded(() => {
      setActiveTool(null);
      setEditorFilePath(filePath);
    });
  }, [runGuarded]);

  const activeToolDef = useMemo(
    () => (activeTool ? TOOL_REGISTRY[activeTool] : null),
    [activeTool],
  );

  const value = useMemo<ToolContextValue>(
    () => ({ activeTool, activeToolDef, pendingFiles, editorFilePath, documentEpoch, selectTool, goToDashboard, setPendingFiles, openEditor, replaceDocument, setNavigationGuard }),
    [activeTool, activeToolDef, pendingFiles, editorFilePath, documentEpoch, selectTool, goToDashboard, openEditor, replaceDocument, setNavigationGuard],
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
