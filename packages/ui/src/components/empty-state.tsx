import { cx } from '../cx';

export function EmptyState({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('sg-empty-state', className)}>
      <p className="sg-empty-state__title">{title}</p>
      {description && <p className="sg-empty-state__description">{description}</p>}
      {children}
    </div>
  );
}
