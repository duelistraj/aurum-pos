import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TablePagination } from './TablePagination';

describe('TablePagination', () => {
  afterEach(cleanup);

  it('shows the inventory range, compact page numbers, and row options', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const onRowsPerPageChange = vi.fn();
    render(
      <TablePagination
        currentPage={5}
        totalPages={10}
        totalItems={96}
        rowsPerPage={10}
        itemLabel="events"
        onPageChange={onPageChange}
        onRowsPerPageChange={onRowsPerPageChange}
      />,
    );

    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 41 to 50 of 96 events');
    expect(screen.getByRole('button', { name: 'Page 5' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByText('...')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Page 1' }));
    expect(onPageChange).toHaveBeenCalledWith(1);
    await user.click(screen.getByRole('button', { name: 'Rows per page' }));
    await user.click(screen.getByRole('option', { name: '20' }));
    expect(onRowsPerPageChange).toHaveBeenCalledWith(20);
  });

  it('disables navigation while a page is loading', () => {
    render(
      <TablePagination
        currentPage={2}
        totalPages={3}
        totalItems={30}
        rowsPerPage={10}
        itemLabel="invoices"
        loading
        onPageChange={vi.fn()}
        onRowsPerPageChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeDisabled();
  });
});
