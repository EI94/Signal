import { cx } from '../cx';

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({
  variant = 'neutral',
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span className={cx('sg-badge', `sg-badge--${variant}`, className)} {...rest}>
      {children}
    </span>
  );
}
