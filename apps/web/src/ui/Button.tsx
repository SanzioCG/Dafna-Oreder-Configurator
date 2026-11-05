import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'success' | 'ghost' | 'floating';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** icon before / after the label (lucide or custom, from ui/icons) */
  icon?: ReactNode;
  iconAfter?: ReactNode;
  wide?: boolean;
  large?: boolean;
}

/**
 * Design system V2 button: solid fill, one radius, no shadow. `primary` = --primary fill with
 * --on-primary text; `success` = the confirm action; `secondary` = surface + control border.
 */
export function Button({
  variant = 'secondary',
  icon,
  iconAfter,
  wide = false,
  large = false,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const cls = [
    'btn',
    `btn-${variant}`,
    wide ? 'btn-wide' : '',
    large ? 'btn-lg' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={cls} {...rest}>
      {icon}
      {children}
      {iconAfter}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** accessible name (icon-only button) */
  label: string;
  icon: ReactNode;
}

/** Square icon-only button (48 px min touch target), e.g. ± steppers, theme switch. */
export function IconButton({ label, icon, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={className ? `icon-btn ${className}` : 'icon-btn'}
      {...rest}
    >
      {icon}
    </button>
  );
}
