import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header';
import { useConfig } from '../context/ConfigContext';

vi.mock('../context/ConfigContext', () => ({ useConfig: vi.fn() }));

describe('Header', () => {
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
    render(<Header onOpenSidebar={onOpenSidebar} />);

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(onOpenSidebar).toHaveBeenCalledOnce();
    expect(screen.getByRole('img', { name: 'Aurum' }).getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
  });
});
