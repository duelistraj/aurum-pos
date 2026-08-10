import { describe, expect, it } from 'vitest';
import {
  createBreakdownColorMap,
  formatCompactCurrency,
  getChartColor,
  getHorizontalBarMargins,
  selectEvenlySpacedTicks,
} from './chartConfig';

describe('analytics chart configuration', () => {
  it('samples long ranges without dropping their endpoints', () => {
    const dates = Array.from({ length: 30 }, (_, index) => `Day ${index + 1}`);
    const ticks = selectEvenlySpacedTicks(dates, 6);

    expect(ticks).toHaveLength(6);
    expect(ticks[0]).toBe('Day 1');
    expect(ticks[ticks.length - 1]).toBe('Day 30');
    expect(new Set(ticks).size).toBe(ticks.length);
  });

  it('formats compact rupee markers without unnecessary trailing zeroes', () => {
    expect(formatCompactCurrency(500)).toBe('₹500');
    expect(formatCompactCurrency(10_500)).toBe('₹10.5K');
    expect(formatCompactCurrency(200_000)).toBe('₹2L');
    expect(formatCompactCurrency(15_000_000)).toBe('₹1.5Cr');
  });

  it('uses metal colors only for all-jewellery breakdowns', () => {
    const metalColors = createBreakdownColorMap([
      'Gold Jewellery',
      'Silver Jewellery',
      'Platinum Jewellery',
    ], {
      useMetalColors: true,
      mode: 'dark',
    });
    const categoryColors = createBreakdownColorMap(['Silver Jewellery'], {
      useMetalColors: false,
      mode: 'dark',
    });

    expect(metalColors.get('Gold Jewellery')).toBe('#E8A62B');
    expect(metalColors.get('Silver Jewellery')).toBe('#AAB3BC');
    expect(metalColors.get('Platinum Jewellery')).toBe('#82A5D1');
    expect(categoryColors.get('Silver Jewellery')).not.toBe(
      metalColors.get('Silver Jewellery'),
    );
  });

  it('assigns distinct shared-palette colors to categories in response order', () => {
    const labels = ['Anklet', 'Jewellery', 'Earrings'];
    const colors = createBreakdownColorMap(labels, {
      useMetalColors: false,
      mode: 'light',
    });

    expect(labels.map((label) => colors.get(label))).toEqual([
      getChartColor(0, 'light'),
      getChartColor(1, 'light'),
      getChartColor(2, 'light'),
    ]);
    expect(new Set(colors.values()).size).toBe(labels.length);
  });

  it('reserves enough horizontal space for category and value labels', () => {
    const margins = getHorizontalBarMargins(
      ['Silver Jewellery'],
      ['₹1,23,45,678'],
    );

    expect(margins.left).toBeGreaterThanOrEqual(104);
    expect(margins.right).toBeGreaterThanOrEqual(100);
    expect(margins.bottom).toBe(32);
  });
});
