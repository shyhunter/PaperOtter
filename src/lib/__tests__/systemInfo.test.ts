import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { getSystemInfo } from '@/lib/systemInfo';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { platform: 'MacIntel' });
});

describe('getSystemInfo', () => {
  it('SI-01: returns the OS and architecture reported by the backend', async () => {
    vi.mocked(invoke).mockResolvedValue('macOS (aarch64)');
    expect(await getSystemInfo()).toBe('macOS (aarch64)');
  });

  it('SI-02: falls back to navigator.platform when the command throws', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('no backend'));
    expect(await getSystemInfo()).toBe('MacIntel');
  });

  it('SI-03: falls back when the backend returns an empty or non-string value', async () => {
    vi.mocked(invoke).mockResolvedValue('');
    expect(await getSystemInfo()).toBe('MacIntel');
    vi.mocked(invoke).mockResolvedValue(undefined);
    expect(await getSystemInfo()).toBe('MacIntel');
  });

  it('SI-04: reports unknown when there is no platform to fall back to', async () => {
    vi.stubGlobal('navigator', { platform: '' });
    vi.mocked(invoke).mockRejectedValue(new Error('no backend'));
    expect(await getSystemInfo()).toBe('unknown');
  });
});
