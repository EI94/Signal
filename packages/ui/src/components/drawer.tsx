'use client';

import { useEffect } from 'react';
import { cx } from '../cx';

export function Drawer({
  open,
  onClose,
  children,
  side = 'right',
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  side?: 'right' | 'left';
}) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="sg-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside role="dialog" aria-modal="true" className={cx('sg-drawer', `sg-drawer--${side}`)}>
        {children}
      </aside>
    </>
  );
}
