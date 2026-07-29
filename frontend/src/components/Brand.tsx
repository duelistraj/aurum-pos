import React from 'react';
import aurumLogo from '../assets/aurum-logo.svg';

interface AurumMarkProps {
  className?: string;
}

export const AurumMark: React.FC<AurumMarkProps> = ({ className = '' }) => (
  <img
    className={className}
    src={aurumLogo}
    alt="Aurum"
  />
);

interface BrandLockupProps {
  appName: string;
  isPro: boolean;
  compact?: boolean;
}

export const BrandLockup: React.FC<BrandLockupProps> = ({ appName, isPro, compact = false }) => (
  <div className={`brand-lockup${compact ? ' brand-lockup--compact' : ''}`}>
    <AurumMark className="brand-mark" />
    {!compact ? (
      <span className="brand-lockup__name">
        <span className="brand-lockup__title">{appName}</span>
        {isPro ? <sup className="brand-lockup__plan">Pro</sup> : null}
      </span>
    ) : null}
  </div>
);
