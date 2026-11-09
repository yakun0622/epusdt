import { useI18n } from '../../i18n/i18n-provider';
import { createContext, useContext, useRef, useState, useEffect, useCallback, type ReactNode } from 'react';

type ToastTone = 'success' | 'error' | 'info';
export interface ToastInput { title: string; description?: string; tone?: ToastTone }
interface ToastItemData extends ToastInput { id: number }
interface ToastContextValue { notify: (input: ToastInput) => void }
const ToastContext = createContext<ToastContextValue | null>(null);

function ToastItem({ item, remove }: { item: ToastItemData; remove: (id: number) => void }) {
  const { t } = useI18n();
  useEffect(() => {
    const timer = window.setTimeout(() => remove(item.id), 4500);
    return () => window.clearTimeout(timer);
  }, [item.id, remove]);
  return <div className={'ui-toast ui-toast--' + (item.tone ?? 'info')}
    role={item.tone === 'error' ? 'alert' : 'status'}>
    <div><strong>{item.title}</strong>{item.description && <p>{item.description}</p>}</div>
    <button type="button" onClick={() => remove(item.id)} aria-label={t('common.close')}>×</button>
  </div>;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItemData[]>([]);
  const nextId = useRef(1);
  const notify = useCallback((input: ToastInput) => {
    setItems(current => [...current, { ...input, id: nextId.current++ }]);
  }, []);
  const remove = useCallback((id: number) => setItems(current => current.filter(item => item.id !== id)), []);
  return <ToastContext.Provider value={{ notify }}>
    {children}
    <div className="ui-toast-stack" aria-live="polite">
      {items.map(item => <ToastItem key={item.id} item={item} remove={remove}/>)}
    </div>
  </ToastContext.Provider>;
}
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be inside ToastProvider');
  return context;
}
