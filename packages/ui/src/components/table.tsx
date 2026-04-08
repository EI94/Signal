import { cx } from '../cx';

export function Table({
  children,
  className,
  ...rest
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cx('sg-table', className)} {...rest}>
      {children}
    </table>
  );
}

export function Thead({ children, ...rest }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...rest}>{children}</thead>;
}

export function Tbody({ children, ...rest }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...rest}>{children}</tbody>;
}

export function Tr({ children, ...rest }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr {...rest}>{children}</tr>;
}

export function Th({ children, className, ...rest }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cx(className)} {...rest}>
      {children}
    </th>
  );
}

export function Td({ children, className, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cx(className)} {...rest}>
      {children}
    </td>
  );
}
