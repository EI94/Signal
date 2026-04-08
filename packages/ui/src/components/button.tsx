import { cx } from '../cx';

export type ButtonVariant = 'default' | 'ghost';

export function Button({
  variant = 'default',
  children,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cx('sg-btn', variant !== 'default' && `sg-btn--${variant}`, className)}
      {...rest}
    >
      {children}
    </button>
  );
}
