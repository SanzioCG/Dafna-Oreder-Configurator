import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

type Variant = 'primary' | 'secondary' | 'success' | 'ghost' | 'text' | 'floating';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** icon before / after the label (lucide or custom, from ui/icons) */
  icon?: ReactNode;
  iconAfter?: ReactNode;
  wide?: boolean;
  large?: boolean;
  /** React 19: ref is a plain prop on function components */
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Design system V3 button (pill). `primary` = --primary fill + --ink text ("Keyingi");
 * `success` = "Tasdiqlash"; `secondary` = --paper pill + --ink text (outline per the rules);
 * `text` = text button ("Orqaga", "Tayyor — ko'rib chiqish", "Tahrirlash").
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

/** Round icon-only button (64 px at 1080p), e.g. ± steppers, theme switch. */
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
