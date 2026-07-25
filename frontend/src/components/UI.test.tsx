import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Alert, Badge, Button, Card, Input, Loader, Modal, Select } from './UI';

describe('shared UI primitives', () => {
  it('uses semantic status styling and exposes an accessible alert', () => {
    render(<Alert type="success" title="Saved" message="The item was updated." />);

    expect(screen.getByRole('alert')).toHaveClass('ui-alert', 'ui-alert--success');
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('renders token-based controls and accepts composition classes', () => {
    render(
      <Card className="custom-card">
        <Input aria-label="Name" className="custom-input" />
        <Select
          aria-label="Type"
          options={[{ value: 'gold', label: 'Gold' }]}
          className="custom-select"
        />
        <Button className="custom-button">Save</Button>
        <Badge variant="info" className="custom-badge">Info</Badge>
      </Card>,
    );

    expect(screen.getByText('Save')).toHaveClass('ui-button', 'ui-button--primary', 'custom-button');
    expect(screen.getByLabelText('Name')).toHaveClass('ui-input', 'custom-input');
    expect(screen.getByLabelText('Type')).toHaveClass('ui-select', 'custom-select');
    expect(screen.getByText('Info')).toHaveClass('ui-badge', 'ui-badge--info', 'custom-badge');
    expect(screen.getByText('Save').closest('.ui-card')).toHaveClass('custom-card');
  });

  it('renders a labeled modal and closes it through the accessible control', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen title="Edit rate" onClose={onClose} footer={<Button>Save</Button>}>
        <p>Rate details</p>
      </Modal>,
    );

    expect(screen.getByRole('dialog', { name: 'Edit rate' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders a loading status with the requested size', () => {
    render(<Loader size="sm" />);

    expect(screen.getByRole('status')).toHaveClass('ui-loader');
    expect(screen.getByRole('status').querySelector('svg')).toHaveClass('w-6', 'h-6');
  });
});
