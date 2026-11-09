import type { ReactNode } from 'react';
import { EmptyState, LoadingState } from './card';
export interface Column<T> {
  key: string;
  title: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'center' | 'right';
}
export function DataTable<T>({ columns, rows, getRowKey, emptyLabel, loading, loadingLabel }: {
  columns: ReadonlyArray<Column<T>>;
  rows: ReadonlyArray<T>;
  getRowKey: (row: T) => string | number;
  emptyLabel: string;
  loading?: boolean;
  loadingLabel?: string;
}) {
  if (loading) return <LoadingState label={loadingLabel ?? 'Loading…'}/>;
  if (rows.length === 0) return <EmptyState title={emptyLabel}/>;
  return <div className="ui-table-scroll" role="region" aria-label="Data table" tabIndex={0}>
    <table className="ui-table">
      <thead><tr>{columns.map(column =>
        <th key={column.key} scope="col" style={{ textAlign: column.align ?? 'left' }}>{column.title}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={getRowKey(row)}>{columns.map(column =>
        <td key={column.key} style={{ textAlign: column.align ?? 'left' }}>{column.render(row)}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}
