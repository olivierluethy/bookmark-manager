import { useCallback, useRef } from 'react';

type DividerProps = {
  ariaLabel: string;
  value: number;
  onChange: (px: number) => void;
  /** 'left' when the resized pane is left of the divider. */
  side: 'left' | 'right';
};

export function PaneDivider({ ariaLabel, value, onChange, side }: DividerProps) {
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      const parent = e.currentTarget.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      onChange(side === 'left' ? e.clientX - rect.left : rect.right - e.clientX);
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
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      className="w-1 shrink-0 cursor-col-resize bg-line/60 transition-colors duration-150 hover:bg-accent focus-visible:bg-accent"
    />
  );
}
