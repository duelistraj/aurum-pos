import React from 'react';
import { Menu } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AurumMark } from './Brand';

interface HeaderProps {
  navigationOpen: boolean;
  onOpenSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ navigationOpen, onOpenSidebar }) => (
  <header className="app-mobile-header">
    <button
      type="button"
      className="app-mobile-header__menu"
      onClick={onOpenSidebar}
      aria-label="Open navigation"
      aria-expanded={navigationOpen}
    >
      <Menu className="app-mobile-header__menu-icon" />
    </button>
    <span className="app-mobile-header__spacer" aria-hidden="true" />
    {!navigationOpen ? (
      <Link to="/" className="app-mobile-header__brand" aria-label="Aurum POS dashboard">
        <AurumMark className="app-mobile-header__brand-mark" />
      </Link>
    ) : null}
  </header>
);
