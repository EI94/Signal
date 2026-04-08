import { cx } from '../cx';

export type SkeletonVariant = 'text' | 'block';

export function Skeleton({
  variant = 'text',
  width,
  height,
  className,
}: {
  variant?: SkeletonVariant;
  width?: string;
  height?: string;
  className?: string;
}) {
  return (
    <div
      className={cx('sg-skeleton', `sg-skeleton--${variant}`, className)}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}
