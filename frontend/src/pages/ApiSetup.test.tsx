import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiSetup } from './ApiSetup';
import { getApiBaseUrl, saveApiBaseUrl, validateApiBaseUrl } from '../utils/apiConfig';

vi.mock('../utils/apiConfig', () => ({
  getApiBaseUrl: vi.fn(),
  saveApiBaseUrl: vi.fn(),
  validateApiBaseUrl: vi.fn(),
}));

describe('ApiSetup', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiBaseUrl).mockResolvedValue('http://localhost:8080');
    vi.mocked(validateApiBaseUrl).mockResolvedValue(undefined);
    vi.mocked(saveApiBaseUrl).mockResolvedValue('http://localhost:8080');
  });

  it('renders the redesigned setup surface with the saved URL', async () => {
    render(<ApiSetup onConfigured={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Connect your backend' })).toBeInTheDocument();
    expect(screen.getByText('Backend connection')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveClass('api-setup__panel');
    expect(screen.getByRole('status')).toHaveTextContent('Ready to verify');
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Backend API URL' })).toHaveValue('http://localhost:8080'));
  });

  it('validates and saves the entered URL before completing setup', async () => {
    const user = userEvent.setup();
    const onConfigured = vi.fn();
    render(<ApiSetup onConfigured={onConfigured} />);

    const input = await screen.findByRole('textbox', { name: 'Backend API URL' });
    await user.clear(input);
    await user.type(input, 'https://pos.example.com');
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));

    await waitFor(() => expect(validateApiBaseUrl).toHaveBeenCalledWith('https://pos.example.com'));
    expect(saveApiBaseUrl).toHaveBeenCalledWith('https://pos.example.com');
    expect(onConfigured).toHaveBeenCalledOnce();
  });

  it('shows validation failures without saving the URL', async () => {
    const user = userEvent.setup();
    vi.mocked(validateApiBaseUrl).mockRejectedValue(new Error('Backend unavailable'));
    render(<ApiSetup onConfigured={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Save and continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Backend unavailable');
    expect(saveApiBaseUrl).not.toHaveBeenCalled();
  });

  it('supports closing the embedded setup surface', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ApiSetup onConfigured={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Close API setup' }));

    expect(onCancel).toHaveBeenCalledOnce();
  });
});
