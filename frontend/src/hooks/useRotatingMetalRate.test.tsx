import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRotatingMetalRate } from './useRotatingMetalRate';

const RateProbe = ({ rates }: { rates: Array<{ metal: string }> }) => {
  const rate = useRotatingMetalRate(rates);
  return <span>{rate?.metal ?? 'none'}</span>;
};

describe('useRotatingMetalRate', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('uses canonical order and rotates every five seconds', () => {
    vi.useFakeTimers();
    render(<RateProbe rates={[{ metal: 'platinum' }, { metal: 'silver' }, { metal: 'gold' }]} />);

    expect(screen.getByText('gold')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByText('silver')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByText('platinum')).toBeInTheDocument();
  });

  it('does not rotate a single configured rate', () => {
    vi.useFakeTimers();
    render(<RateProbe rates={[{ metal: 'silver' }]} />);

    act(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByText('silver')).toBeInTheDocument();
  });
});
