import type { ReactNode } from 'react';
import { CheckIcon, InfoIcon, WarningIcon } from './icons';

export type StatusTone = 'info' | 'error' | 'success';

/**
 * One status line (toast, inline note, banner): icon + text on the surface, a 3 px accent bar
 * (V3: peach info card, --ink text). Human text only — never an error code.
 */
export function StatusMessage({
  tone = 'info',
  children,
  action,
  className,
  role = 'status',
  testId,
}: {
  tone?: StatusTone;
  children: ReactNode;
  /** optional trailing control (e.g. dismiss) */
  action?: ReactNode;
  className?: string;
  role?: 'status' | 'alert' | 'note';
  testId?: string;
}) {
  const Icon = tone === 'error' ? WarningIcon : tone === 'success' ? CheckIcon : InfoIcon;
  return (
    <div
      className={['status', `status-${tone}`, className ?? ''].filter(Boolean).join(' ')}
      role={role}
      aria-live={role === 'note' ? undefined : 'polite'}
      data-testid={testId}
    >
      <Icon className="status-icon" />
      <div className="status-body">{children}</div>
      {action}
    </div>
  );
}
