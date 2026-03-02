import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { ToolId, ToolDefinition } from '@/types/tools';
import { TOOL_REGISTRY } from '@/types/tools';

interface ToolContextValue {
  activeTool: ToolId | null;        // null = on dashboard
  activeToolDef: ToolDefinition | null;
  selectTool: (toolId: ToolId) => void;
  goToDashboard: () => void;
}

const ToolContext = createContext<ToolContextValue | null>(null);

export function ToolProvider({ children }: { children: ReactNode }) {
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);

  const selectTool = useCallback((toolId: ToolId) => {
    setActiveTool(toolId);
  }, []);

  const goToDashboard = useCallback(() => {
    setActiveTool(null);
  }, []);

  const activeToolDef = useMemo(
    () => (activeTool ? TOOL_REGISTRY[activeTool] : null),
    [activeTool],
  );

  const value = useMemo<ToolContextValue>(
    () => ({ activeTool, activeToolDef, selectTool, goToDashboard }),
    [activeTool, activeToolDef, selectTool, goToDashboard],
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
