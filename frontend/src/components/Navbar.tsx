import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Check,
  ChevronDown,
  CircleUserRound,
  ExternalLink,
  History as HistoryIcon,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShoppingCart,
  Store,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { useConfig } from '../context/ConfigContext';
import { useShop } from '../context/ShopContext';
import { BrandLockup } from './Brand';

type OpenMenu = 'shop' | 'account' | null;

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Sales', href: '/pos', icon: ShoppingCart },
  { label: 'Inventory', href: '/items', icon: Package },
  { label: 'Metal Rates', href: '/rates', icon: Store },
  { label: 'Transactions', href: '/transactions', icon: HistoryIcon },
  { label: 'Analytics', href: '/analytics', icon: BarChart3 },
];

interface NavbarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  collapsed,
  mobileOpen,
  onToggleCollapsed,
  onCloseMobile,
}) => {
  const { appName, isDarkMode, toggleDarkMode } = useConfig();
  const { activeMembership, memberships, user, reload, selectShop } = useShop();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const shopId = activeMembership?.shop_id ?? '';
  const entitlement = useQuery({
    queryKey: queryKeys.entitlement(shopId),
    queryFn: () => apiClient.getEntitlement(),
    enabled: Boolean(shopId),
  });
  const version = useQuery({
    queryKey: ['version'],
    queryFn: () => apiClient.version(),
    staleTime: Infinity,
  });
  const [openMenu, setOpenMenu] = React.useState<OpenMenu>(null);
  const [loggingOut, setLoggingOut] = React.useState(false);
  const menuAreaRef = React.useRef<HTMLDivElement>(null);
  const shopTriggerRef = React.useRef<HTMLButtonElement>(null);
  const accountTriggerRef = React.useRef<HTMLButtonElement>(null);
  const shopOptionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const isPro = entitlement.data?.plan === 'pro';
  const planDescription = isPro
    ? 'Active for this shop'
    : entitlement.data
      ? `${entitlement.data.active_item_count}/${entitlement.data.active_item_limit} active items`
      : 'View plan and billing';
  const displayName = user?.full_name || 'Account';
  const role = activeMembership?.role ? activeMembership.role.toLowerCase() : 'member';

  React.useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuAreaRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (openMenu === 'shop') shopTriggerRef.current?.focus();
      if (openMenu === 'account') accountTriggerRef.current?.focus();
      setOpenMenu(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenu]);

  const focusShopOption = (index: number) => {
    const optionCount = memberships.length;
    if (optionCount === 0) return;
    const wrappedIndex = (index + optionCount) % optionCount;
    shopOptionRefs.current[wrappedIndex]?.focus();
  };

  const openShopMenu = (focusIndex?: number) => {
    setOpenMenu('shop');
    if (focusIndex !== undefined) {
      window.requestAnimationFrame(() => focusShopOption(focusIndex));
    }
  };

  const handleShopTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openShopMenu(event.key === 'ArrowDown' ? 0 : memberships.length - 1);
    }
  };

  const handleShopOptionKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusShopOption(index + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      focusShopOption(event.key === 'Home' ? 0 : memberships.length - 1);
    }
  };

  const chooseShop = (selectedShopId: string) => {
    setOpenMenu(null);
    if (selectedShopId !== shopId) void selectShop(selectedShopId);
    shopTriggerRef.current?.focus();
  };

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setOpenMenu(null);
    try {
      await apiClient.logout();
    } catch {
      // The API client clears local credentials even when server revocation fails.
    }
    queryClient.clear();
    await reload();
    navigate('/login', { replace: true });
    setLoggingOut(false);
  };

  const handleNavigation = () => {
    setOpenMenu(null);
    onCloseMobile();
  };

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={onCloseMobile}
        />
      ) : null}
      <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}${mobileOpen ? ' sidebar--mobile-open' : ''}`}>
        <div className="sidebar__topline">
          <Link to="/" className="sidebar__brand" aria-label={`${appName} dashboard`} onClick={handleNavigation}>
            <BrandLockup appName={appName || 'Aurum POS'} isPro={isPro} compact={collapsed} />
          </Link>
          <button
            type="button"
            className="sidebar__icon-button sidebar__collapse-button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {collapsed ? <PanelLeftOpen className="sidebar__icon" /> : <PanelLeftClose className="sidebar__icon" />}
          </button>
          <button
            type="button"
            className="sidebar__icon-button sidebar__mobile-close"
            onClick={onCloseMobile}
            aria-label="Close navigation"
          >
            <X className="sidebar__icon" />
          </button>
        </div>

        <nav className="sidebar__nav" aria-label="Primary navigation">
          <p className="sidebar__section-label">Workspace</p>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === '/' ? location.pathname === '/' : location.pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={handleNavigation}
                aria-current={isActive ? 'page' : undefined}
                className={`sidebar__nav-link${isActive ? ' is-active' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="sidebar__nav-icon" />
                <span className="sidebar__nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div ref={menuAreaRef} className="sidebar__footer">
          <p className="sidebar__section-label">Shop</p>
          {memberships.length > 0 ? (
            <div className="sidebar__menu-anchor">
              <button
                ref={shopTriggerRef}
                type="button"
                aria-label="Active shop"
                aria-haspopup="listbox"
                aria-expanded={openMenu === 'shop'}
                onClick={() => setOpenMenu((current) => current === 'shop' ? null : 'shop')}
                onKeyDown={handleShopTriggerKeyDown}
                className={`sidebar__shop-trigger${openMenu === 'shop' ? ' is-open' : ''}`}
                title={collapsed ? activeMembership?.shop_name ?? 'Select shop' : undefined}
              >
                <span className="sidebar__shop-icon"><Store className="sidebar__nav-icon" /></span>
                <span className="sidebar__shop-copy">
                  <span className="sidebar__shop-label">Active shop</span>
                  <span className="sidebar__shop-name">{activeMembership?.shop_name ?? 'Select shop'}</span>
                </span>
                <ChevronDown className={`sidebar__chevron${openMenu === 'shop' ? ' is-open' : ''}`} />
              </button>
              {openMenu === 'shop' ? (
                <div
                  role="listbox"
                  aria-label="Shops"
                  className={`sidebar__popover sidebar__shop-menu${collapsed ? ' sidebar__popover--collapsed' : ''}`}
                >
                  <p className="sidebar__popover-title">Switch shop</p>
                  {memberships.map((membership, index) => {
                    const selected = membership.shop_id === shopId;
                    return (
                      <button
                        key={membership.shop_id}
                        ref={(node) => { shopOptionRefs.current[index] = node; }}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => chooseShop(membership.shop_id)}
                        onKeyDown={(event) => handleShopOptionKeyDown(event, index)}
                        className={`sidebar__menu-option${selected ? ' is-selected' : ''}`}
                      >
                        <span>{membership.shop_name}</span>
                        {selected ? <Check className="sidebar__menu-check" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="sidebar__account-wrap">
            <button
              ref={accountTriggerRef}
              type="button"
              className={`sidebar__account-trigger${openMenu === 'account' ? ' is-open' : ''}`}
              onClick={() => setOpenMenu((current) => current === 'account' ? null : 'account')}
              aria-label="Account and settings"
              aria-haspopup="menu"
              aria-expanded={openMenu === 'account'}
              title={collapsed ? 'Account and settings' : undefined}
            >
              <span className="sidebar__avatar"><CircleUserRound className="sidebar__avatar-icon" /></span>
              <span className="sidebar__account-copy">
                <span className="sidebar__account-name">{displayName}</span>
                <span className="sidebar__account-role">{role}</span>
              </span>
              <Settings className="sidebar__settings-icon" />
            </button>
            {openMenu === 'account' ? (
              <div
                role="menu"
                aria-label="Account and settings"
                className={`sidebar__popover sidebar__account-menu${collapsed ? ' sidebar__popover--collapsed' : ''}`}
              >
                <div className="sidebar__account-heading">
                  <span className="sidebar__account-heading-name">{displayName}</span>
                  <span className="sidebar__account-heading-email">{user?.email ?? 'Account settings'}</span>
                </div>
                <Link
                  to="/subscription"
                  role="menuitem"
                  onClick={handleNavigation}
                  className="sidebar__menu-option sidebar__menu-option--stacked"
                >
                  <span>
                    <span className="sidebar__menu-option-title">{isPro ? 'Aurum Pro' : 'Upgrade to Pro'}</span>
                    <span className="sidebar__menu-option-description">{planDescription}</span>
                  </span>
                </Link>
                {activeMembership && ['OWNER', 'ADMIN'].includes(activeMembership.role) ? (
                  <Link
                    to="/manage-shop"
                    role="menuitem"
                    onClick={handleNavigation}
                    className="sidebar__menu-option"
                  >
                    <Users className="sidebar__menu-icon" />
                    <span>Manage Shop</span>
                  </Link>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  onClick={toggleDarkMode}
                  className="sidebar__menu-option"
                >
                  {isDarkMode ? <Sun className="sidebar__menu-icon" /> : <Moon className="sidebar__menu-icon" />}
                  <span>{isDarkMode ? 'Use light theme' : 'Use dark theme'}</span>
                </button>
                <a
                  href={version.data?.source ?? 'https://github.com/duelistraj/aurum-pos'}
                  target="_blank"
                  rel="noreferrer"
                  role="menuitem"
                  onClick={() => setOpenMenu(null)}
                  className="sidebar__menu-option"
                >
                  <ExternalLink className="sidebar__menu-icon" />
                  <span>View source on GitHub</span>
                </a>
                <div className="sidebar__menu-divider" />
                <button
                  type="button"
                  role="menuitem"
                  disabled={loggingOut}
                  onClick={() => void logout()}
                  className="sidebar__menu-option sidebar__menu-option--danger"
                >
                  <LogOut className="sidebar__menu-icon" />
                  <span>{loggingOut ? 'Logging out…' : 'Log out'}</span>
                </button>
              </div>
            ) : null}
          </div>

        </div>
      </aside>
    </>
  );
};
