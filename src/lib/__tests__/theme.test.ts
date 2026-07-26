import { afterEach, describe, expect, it } from 'vitest';
import { readStoredMode, resolveTheme, safeGetItem, safeSetItem } from '@/lib/theme';

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

describe('safeGetItem / safeSetItem', () => {
  const originalLocalStorage = globalThis.localStorage;

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  it('safeGetItem returns null when storage throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('storage disabled');
        },
        setItem: () => {
          throw new Error('storage disabled');
        },
      },
      writable: true,
      configurable: true,
    });

    expect(safeGetItem('any-key')).toBeNull();
  });

  it('safeSetItem does not throw when storage throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('storage disabled');
        },
        setItem: () => {
          throw new Error('storage disabled');
        },
      },
      writable: true,
      configurable: true,
    });

    expect(() => safeSetItem('any-key', 'value')).not.toThrow();
  });
});
