import type { ReactNode } from 'react';

/**
 * Toggle (design system V3): a pill with a round knob. ON = --ink track + white knob;
 * OFF = --paper track + --ink outlined knob. The label is part of the button (large tap area).
 */
export function Toggle({
  checked,
  onChange,
  children,
  testId,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={checked ? 'toggle on' : 'toggle'}
      data-testid={testId}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-knob" />
      </span>
      <span className="toggle-label">{children}</span>
    </button>
  );
}
