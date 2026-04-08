import { cx } from '../cx';

export type SurfaceVariant = 'default' | 'elevated' | 'subtle';

export function Surface({
  variant = 'default',
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { variant?: SurfaceVariant }) {
  return (
    <div
      className={cx('sg-surface', variant !== 'default' && `sg-surface--${variant}`, className)}
      {...rest}
    >
      {children}
    </div>
  );
}
