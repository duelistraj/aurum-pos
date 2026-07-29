import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header';
import { useConfig } from '../context/ConfigContext';

vi.mock('../context/ConfigContext', () => ({ useConfig: vi.fn() }));

describe('Header', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(useConfig).mockReturnValue({
      appName: 'Aurum POS',
      isDarkMode: false,
      toggleDarkMode: vi.fn(),
    });
  });

  it('opens navigation from the compact mobile header', async () => {
    const onOpenSidebar = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Header navigationOpen={false} onOpenSidebar={onOpenSidebar} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(onOpenSidebar).toHaveBeenCalledOnce();
    expect(screen.getByRole('img', { name: 'Aurum' }).getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
  });

  it('hides the duplicate mobile logo while navigation is open', () => {
    render(
      <MemoryRouter>
        <Header navigationOpen onOpenSidebar={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('img', { name: 'Aurum' })).not.toBeInTheDocument();
    expect(screen.queryByText('Aurum POS')).not.toBeInTheDocument();
  });
});
