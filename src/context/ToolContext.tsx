import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { ToolId, ToolDefinition } from '@/types/tools';
import { TOOL_REGISTRY } from '@/types/tools';

interface ToolContextValue {
  activeTool: ToolId | null;        // null = on dashboard
  activeToolDef: ToolDefinition | null;
  pendingFiles: string[];            // file paths dropped on dashboard, forwarded to tool flow
  editorFilePath: string | null;     // non-null = open in full PDF editor
  selectTool: (toolId: ToolId) => void;
  goToDashboard: () => void;
  setPendingFiles: (files: string[]) => void;
  openEditor: (filePath: string) => void;
}

const ToolContext = createContext<ToolContextValue | null>(null);

export function ToolProvider({ children }: { children: ReactNode }) {
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const [pendingFiles, setPendingFiles] = useState<string[]>([]);
  const [editorFilePath, setEditorFilePath] = useState<string | null>(null);

  const selectTool = useCallback((toolId: ToolId) => {
    setEditorFilePath(null);
    setActiveTool(toolId);
  }, []);

  const goToDashboard = useCallback(() => {
    setActiveTool(null);
    setEditorFilePath(null);
    setPendingFiles([]);
  }, []);

  const openEditor = useCallback((filePath: string) => {
    setActiveTool(null);
    setEditorFilePath(filePath);
  }, []);

  const activeToolDef = useMemo(
    () => (activeTool ? TOOL_REGISTRY[activeTool] : null),
    [activeTool],
  );

  const value = useMemo<ToolContextValue>(
    () => ({ activeTool, activeToolDef, pendingFiles, editorFilePath, selectTool, goToDashboard, setPendingFiles, openEditor }),
    [activeTool, activeToolDef, pendingFiles, editorFilePath, selectTool, goToDashboard, openEditor],
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
