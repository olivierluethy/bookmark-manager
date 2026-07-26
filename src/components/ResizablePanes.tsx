import { useCallback, useRef } from 'react';
import { PANE_MIN, PANE_MAX } from '@/stores/ui';

type DividerProps = {
  ariaLabel: string;
  value: number;
  onChange: (px: number) => void;
  /** 'left' when the resized pane is left of the divider. */
  side: 'left' | 'right';
  /** id of the <aside> element this divider resizes. */
  ariaControls: string;
};

/**
 * Pure arithmetic for turning a pointer drag into a new pane width.
 *
 * Deliberately has no DOM dependency (no `getBoundingClientRect`) so it can
 * be unit-tested without jsdom, and so it is immune to changes in the DOM
 * structure surrounding the divider (e.g. wrapping fragments, added padding).
 *
 * Not clamped here — callers (the store setters) already clamp to
 * `[PANE_MIN, PANE_MAX]`.
 */
export function computeDragWidth(
  startWidth: number,
  startX: number,
  clientX: number,
  side: 'left' | 'right',
): number {
  const delta = clientX - startX;
  return side === 'left' ? startWidth + delta : startWidth - delta;
}

export function PaneDivider({ ariaLabel, value, onChange, side, ariaControls }: DividerProps) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = value;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [value],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      onChange(computeDragWidth(startWidth.current, startX.current, e.clientX, side));
    },
    [onChange, side],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 48 : 16;
      if (e.key === 'ArrowLeft') onChange(value + (side === 'left' ? -step : step));
      else if (e.key === 'ArrowRight') onChange(value + (side === 'left' ? step : -step));
      else if (e.key === 'Home') onChange(PANE_MIN);
      else if (e.key === 'End') onChange(PANE_MAX);
      else return;
      e.preventDefault();
    },
    [onChange, side, value],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuenow={value}
      aria-valuemin={PANE_MIN}
      aria-valuemax={PANE_MAX}
      aria-controls={ariaControls}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      className="w-1 shrink-0 cursor-col-resize bg-line/60 transition-colors duration-150 hover:bg-accent focus-visible:bg-accent"
    />
  );
}
