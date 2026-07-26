import { describe, expect, it } from 'vitest';
import { readStoredMode, resolveTheme } from '@/lib/theme';

describe('resolveTheme', () => {
  it('passes through explicit modes regardless of system preference', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the system preference in system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('readStoredMode', () => {
  it('defaults to system when unset or invalid', () => {
    expect(readStoredMode(null)).toBe('system');
    expect(readStoredMode('purple')).toBe('system');
  });

  it('accepts the three valid modes', () => {
    expect(readStoredMode('light')).toBe('light');
    expect(readStoredMode('dark')).toBe('dark');
    expect(readStoredMode('system')).toBe('system');
  });
});
