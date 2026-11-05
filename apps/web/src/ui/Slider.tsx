import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

interface SliderProps {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  label: string;
}

/**
 * Large touch slider. Custom (not <input type=range>) so that off-grid values such as the
 * 516 mm default depth are shown exactly instead of being snapped by the browser.
 * Dragging snaps to `min + k·step` (and `max`).
 */
export function Slider({ min, max, step, value, onChange, label }: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const shown = Math.min(max, Math.max(min, value));
  const ratio = max > min ? (shown - min) / (max - min) : 0;

  const valueAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return shown;
    const r = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const snapped = min + Math.round((r * (max - min)) / step) * step;
    return Math.min(max, Math.max(min, snapped));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // synthetic / already-released pointer: dragging still works while over the slider
    }
    onChange(valueAt(e.clientX));
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) onChange(valueAt(e.clientX));
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const deltas: Record<string, number> = {
      ArrowLeft: -step,
      ArrowDown: -step,
      ArrowRight: step,
      ArrowUp: step,
      PageDown: -10 * step,
      PageUp: 10 * step,
    };
    let next: number | undefined;
    if (e.key in deltas) next = shown + (deltas[e.key] ?? 0);
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    if (next === undefined) return;
    e.preventDefault();
    onChange(Math.min(max, Math.max(min, next)));
  };

  return (
    <div
      className="slider"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={shown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
    >
      <div className="slider-track" ref={trackRef}>
        <div className="slider-fill" style={{ width: `${ratio * 100}%` }} />
        <div className="slider-thumb" style={{ left: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
