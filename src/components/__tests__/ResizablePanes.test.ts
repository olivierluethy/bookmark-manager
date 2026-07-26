import { describe, expect, it } from 'vitest';
import { computeDragWidth } from '@/components/ResizablePanes';

describe('computeDragWidth', () => {
  it('dragging right grows a left-side pane', () => {
    expect(computeDragWidth(260, 100, 140, 'left')).toBe(300);
  });

  it('dragging right shrinks a right-side pane', () => {
    expect(computeDragWidth(340, 100, 140, 'right')).toBe(300);
  });

  it('dragging left shrinks a left-side pane', () => {
    expect(computeDragWidth(260, 140, 100, 'left')).toBe(220);
  });

  it('dragging left grows a right-side pane', () => {
    expect(computeDragWidth(340, 140, 100, 'right')).toBe(380);
  });

  it('zero delta returns the start width regardless of side', () => {
    expect(computeDragWidth(260, 100, 100, 'left')).toBe(260);
    expect(computeDragWidth(340, 100, 100, 'right')).toBe(340);
  });
});
