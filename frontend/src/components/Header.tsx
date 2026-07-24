import React from 'react';
import { Menu } from 'lucide-react';
import { useConfig } from '../context/ConfigContext';
import { BrandLockup } from './Brand';

interface HeaderProps {
  onOpenSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenSidebar }) => {
  const { appName } = useConfig();

  return (
    <header className="app-mobile-header">
      <button
        type="button"
        className="app-mobile-header__menu"
        onClick={onOpenSidebar}
        aria-label="Open navigation"
      >
        <Menu className="app-mobile-header__menu-icon" />
      </button>
      <BrandLockup appName={appName || 'Aurum POS'} isPro={false} />
      <span className="app-mobile-header__spacer" aria-hidden="true" />
    </header>
  );
};
