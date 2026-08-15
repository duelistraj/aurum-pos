import React from 'react';
import { TopSellingItem } from '../../types';
import { formatWholeCurrency } from '../../utils';

const soldAmountFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 3,
});

const formatSoldAmount = (item: TopSellingItem): string => {
  const amount = soldAmountFormatter.format(item.sold_amount);
  if (item.sold_unit === 'gram') return `${amount} gram sold`;
  return `${amount} ${item.sold_amount === 1 ? 'piece' : 'pieces'} sold`;
};

export const TopSellingItems: React.FC<{
  items: TopSellingItem[];
  emptyMessage: string;
  emptyIcon: React.ReactNode;
}> = ({ items, emptyMessage, emptyIcon }) => {
  if (items.length === 0) {
    return (
      <div className="analytics-empty-state analytics-top-items__empty">
        {emptyIcon}
        <span>{emptyMessage}</span>
      </div>
    );
  }

  return (
    <ol className="analytics-top-items" aria-label="Top items by sales value">
      {items.map((item, index) => (
        <li key={`${item.sku}-${item.sold_unit}`} className="analytics-top-item">
          <span className="analytics-top-item__rank" aria-label={`Rank ${index + 1}`}>
            {index + 1}
          </span>
          <span className="analytics-top-item__identity">
            <strong title={item.name}>{item.name}</strong>
            <small>
              <span title={item.sku}>{item.sku}</span>
              <span aria-hidden="true">·</span>
              <span>{formatSoldAmount(item)}</span>
            </small>
          </span>
          <span className="analytics-top-item__value">
            <strong>{formatWholeCurrency(item.sales_value)}</strong>
            <small>Sales value</small>
          </span>
        </li>
      ))}
    </ol>
  );
};
