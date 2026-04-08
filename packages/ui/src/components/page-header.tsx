import { cx } from '../cx';

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('sg-page-header', className)}>
      <div>
        <h1 className="sg-page-header__title">{title}</h1>
        {subtitle && <p className="sg-page-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="sg-page-header__actions">{actions}</div>}
    </div>
  );
}
