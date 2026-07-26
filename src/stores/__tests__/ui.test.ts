import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore, PANE_MIN, PANE_MAX } from '@/stores/ui';

describe('ui store layout', () => {
  beforeEach(() => useUiStore.getState().resetForTest());

  it('clamps pane widths to the allowed range', () => {
    useUiStore.getState().setSidebarWidth(10);
    expect(useUiStore.getState().sidebarWidth).toBe(PANE_MIN);

    useUiStore.getState().setSidebarWidth(9999);
    expect(useUiStore.getState().sidebarWidth).toBe(PANE_MAX);
  });

  it('toggles pane collapse independently', () => {
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
    expect(useUiStore.getState().detailCollapsed).toBe(false);
  });

  it('defaults to comfortable density and list view', () => {
    expect(useUiStore.getState().density).toBe('comfortable');
    expect(useUiStore.getState().viewMode).toBe('list');
  });
});
