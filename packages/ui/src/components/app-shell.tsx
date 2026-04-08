import { cx } from '../cx';

export function AppShell({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('sg-shell', className)} {...rest}>
      {children}
    </div>
  );
}

export function AppShellHeader({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <header className={cx('sg-shell__header', className)} {...rest}>
      {children}
    </header>
  );
}

export function AppShellMain({
  children,
  className,
  sidebar,
  ...rest
}: React.HTMLAttributes<HTMLElement> & { sidebar?: React.ReactNode }) {
  return (
    <div className="sg-shell__body">
      {sidebar && <nav className="sg-shell__sidebar">{sidebar}</nav>}
      <main className={cx('sg-shell__main', className)} {...rest}>
        {children}
      </main>
    </div>
  );
}
