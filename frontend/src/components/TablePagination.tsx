import React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

const ROW_OPTIONS = [10, 20, 50, 100] as const;

const pageNumbers = (currentPage: number, totalPages: number): Array<number | 'ellipsis'> => {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  if (currentPage <= 3) return [1, 2, 3, 'ellipsis', totalPages];
  if (currentPage >= totalPages - 2) {
    return [1, 'ellipsis', totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, 'ellipsis', currentPage, 'ellipsis', totalPages];
};

interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  rowsPerPage: number;
  itemLabel: string;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rows: number) => void;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  rowsPerPage,
  itemLabel,
  loading = false,
  onPageChange,
  onRowsPerPageChange,
}) => {
  const [rowsOpen, setRowsOpen] = React.useState(false);
  const rowsRef = React.useRef<HTMLDivElement>(null);
  const start = totalItems > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0;
  const end = Math.min(currentPage * rowsPerPage, totalItems);

  React.useEffect(() => {
    if (!rowsOpen) return undefined;
    const close = (event: MouseEvent) => {
      if (!rowsRef.current?.contains(event.target as Node)) setRowsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRowsOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [rowsOpen]);

  const pages = pageNumbers(currentPage, totalPages);
  return (
    <div className="table-pagination-bar">
      <div className="table-pagination-bar__range">
        Showing <strong>{start}</strong> to <strong>{end}</strong> of{' '}
        <strong>{totalItems}</strong> {itemLabel}
      </div>

      {totalPages > 1 ? (
        <nav className="table-pagination-bar__pages" aria-label={`${itemLabel} pagination`}>
          <button
            type="button"
            aria-label="Previous page"
            disabled={loading || currentPage === 1}
            className="table-pagination-bar__page-button"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          >
            <ChevronLeft />
          </button>
          {pages.map((page, index) => page === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="table-pagination-bar__ellipsis" aria-hidden="true">
              ...
            </span>
          ) : (
            <button
              type="button"
              key={page}
              aria-label={`Page ${page}`}
              aria-current={page === currentPage ? 'page' : undefined}
              disabled={loading}
              className={`table-pagination-bar__page-button${page === currentPage ? ' is-active' : ''}`}
              onClick={() => onPageChange(page)}
            >
              {page}
            </button>
          ))}
          <button
            type="button"
            aria-label="Next page"
            disabled={loading || currentPage >= totalPages}
            className="table-pagination-bar__page-button"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          >
            <ChevronRight />
          </button>
        </nav>
      ) : <span aria-hidden="true" />}

      <div className="table-pagination-bar__rows">
        <span>Rows per page</span>
        <div className="inventory-page__rows-dropdown relative" ref={rowsRef}>
          <button
            type="button"
            aria-label="Rows per page"
            aria-haspopup="listbox"
            aria-expanded={rowsOpen}
            disabled={loading}
            className="inventory-page__rows-trigger"
            onClick={() => setRowsOpen((open) => !open)}
          >
            <span>{rowsPerPage}</span>
            <ChevronDown className={`h-4 w-4 transition-transform${rowsOpen ? ' rotate-180' : ''}`} />
          </button>
          {rowsOpen ? (
            <div className="inventory-page__rows-menu" role="listbox" aria-label="Rows per page options">
              {ROW_OPTIONS.map((option) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={rowsPerPage === option}
                  disabled={loading}
                  key={option}
                  className={`inventory-page__rows-option${rowsPerPage === option ? ' is-selected' : ''}`}
                  onClick={() => {
                    onRowsPerPageChange(option);
                    setRowsOpen(false);
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
