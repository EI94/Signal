import { cx } from '../cx';

export function CommandBarShell({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('sg-cmd-bar', className)} {...rest}>
      {children}
    </div>
  );
}
