import type { ReactNode } from 'react';
export function Card({ title, description, children, className = '' }: {
  title?: string; description?: string; children: ReactNode; className?: string;
}) {
  return <section className={'panel ui-card ' + className}>
    {(title || description) && <header className="ui-card-header">
      {title && <h2>{title}</h2>}
      {description && <p>{description}</p>}
    </header>}
    {children}
  </section>;
}
export function EmptyState({ title, description }: { title: string; description?: string }) {
  return <div className="ui-empty" role="status"><strong>{title}</strong>{description && <p>{description}</p>}</div>;
}
export function LoadingState({ label }: { label: string }) {
  return <div className="ui-loading" role="status">
    <span className="ui-spinner" aria-hidden="true"/>{label}
  </div>;
}
