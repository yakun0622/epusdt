import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DataTable } from './data-table';
import { Button } from './button';
import { TextField } from './field';
import { Dialog } from './dialog';

describe('shared UI primitives', () => {
  it('renders accessible table headers and escaped content', () => {
    const html = renderToStaticMarkup(<DataTable
      rows={[{ id: 1, name: '<script>not markup</script>' }]}
      columns={[{ key: 'name', title: 'Name', render: row => row.name }]}
      getRowKey={row => row.id}
      emptyLabel="Nothing"/>);
    expect(html).toContain('scope="col"');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
  it('renders empty and loading states', () => {
    const cols = [{ key: 'name', title: 'Name', render: (row: { id: number }) => row.id }];
    const empty = renderToStaticMarkup(<DataTable rows={[]} columns={cols} getRowKey={row => row.id} emptyLabel="No rows"/>);
    const loading = renderToStaticMarkup(<DataTable rows={[]} columns={cols} getRowKey={row => row.id} emptyLabel="No rows" loading loadingLabel="Loading"/>);
    expect(empty).toContain('No rows');
    expect(loading).toContain('Loading');
  });
  it('disables busy buttons and labels input errors', () => {
    const button = renderToStaticMarkup(<Button busy>Submit</Button>);
    const input = renderToStaticMarkup(<TextField label="Name" error="Required" />);
    expect(button).toContain('disabled');
    expect(button).toContain('aria-busy="true"');
    expect(input).toContain('aria-invalid="true"');
    expect(input).toContain('Required');
  });
  it('labels native dialog and provides a close control', () => {
    const html = renderToStaticMarkup(<Dialog open title="Confirm" onClose={() => {}} closeLabel="Close">Details</Dialog>);
    expect(html).toContain('<dialog');
    expect(html).toContain('aria-label="Confirm"');
    expect(html).toContain('Details');
  });
});
