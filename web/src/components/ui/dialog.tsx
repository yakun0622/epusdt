import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './button';
export interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
}
export function Dialog({ open, title, onClose, closeLabel, children, footer }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={dialogRef} className="ui-dialog"
    aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="ui-dialog-header">
      <h2>{title}</h2>
      <Button variant="ghost" size="sm" type="button" onClick={onClose} aria-label={closeLabel}>×</Button>
    </div>
    <div className="ui-dialog-body">{children}</div>
    {footer && <div className="ui-dialog-footer">{footer}</div>}
  </dialog>;
}
