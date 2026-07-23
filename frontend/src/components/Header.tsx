import React from 'react';
import {
  Check,
  ChevronDown,
  Crown,
  ExternalLink,
  LogOut,
  Moon,
  Server,
  Settings,
  Sun,
  Users,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { useConfig } from '../context/ConfigContext';
import { useShop } from '../context/ShopContext';
import { ApiSetup } from '../pages/ApiSetup';
import { isCloudDistribution } from '../utils/apiConfig';

type OpenMenu = 'shop' | 'settings' | null;

export const Header: React.FC = () => {
  const { appName, isDarkMode, toggleDarkMode } = useConfig();
  const { activeMembership, memberships, reload, selectShop } = useShop();
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
  const [showApiSetup, setShowApiSetup] = React.useState(false);
  const [loggingOut, setLoggingOut] = React.useState(false);
  const menuAreaRef = React.useRef<HTMLDivElement>(null);
  const shopTriggerRef = React.useRef<HTMLButtonElement>(null);
  const settingsTriggerRef = React.useRef<HTMLButtonElement>(null);
  const shopOptionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const displayName = appName || 'Jewellery POS';
  const firstLetter = displayName.charAt(0).toUpperCase();
  const isPro = entitlement.data?.plan === 'pro';
  const planDescription = isPro
    ? 'Active for this shop'
    : entitlement.data
      ? `${entitlement.data.active_item_count}/${entitlement.data.active_item_limit} active items`
      : 'View plan and billing';

  React.useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuAreaRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (openMenu === 'shop') shopTriggerRef.current?.focus();
      if (openMenu === 'settings') settingsTriggerRef.current?.focus();
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

  return (
    <header className="w-full bg-transparent flex-shrink-0">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center gap-3">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-10 h-10 bg-amber-500 rounded-app-control flex items-center justify-center shadow-md flex-shrink-0">
            <span className="font-bold text-white text-xl">{firstLetter}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight truncate">
            {displayName}
            {isPro ? (
              <sup className="ml-1 align-super text-[0.55em] leading-none font-bold text-amber-600 dark:text-amber-400">
                Pro
              </sup>
            ) : null}
          </h1>
        </div>

        <div ref={menuAreaRef} className="flex items-center gap-2 flex-shrink-0">
          {memberships.length > 0 && (
            <div className="relative">
              <button
                ref={shopTriggerRef}
                type="button"
                aria-label="Active shop"
                aria-haspopup="listbox"
                aria-expanded={openMenu === 'shop'}
                onClick={() => setOpenMenu((current) => current === 'shop' ? null : 'shop')}
                onKeyDown={handleShopTriggerKeyDown}
                className={`flex max-w-44 items-center gap-2 rounded-app-control border bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all dark:bg-slate-900 dark:text-slate-200 ${
                  openMenu === 'shop'
                    ? 'border-amber-500 ring-2 ring-amber-500/25'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                }`}
              >
                <span className="truncate">{activeMembership?.shop_name ?? 'Select shop'}</span>
                <ChevronDown
                  className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${openMenu === 'shop' ? 'rotate-180' : ''}`}
                />
              </button>
              {openMenu === 'shop' ? (
                <div
                  role="listbox"
                  aria-label="Shops"
                  className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-app-surface border border-slate-200 bg-white p-2 shadow-xl animate-fade-in dark:border-slate-800 dark:bg-slate-900"
                >
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
                        className={`flex w-full items-center justify-between gap-3 rounded-app-control px-3 py-2.5 text-left text-sm transition-colors ${
                          selected
                            ? 'bg-amber-50 font-bold text-slate-900 dark:bg-amber-500/10 dark:text-white'
                            : 'font-semibold text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate">{membership.shop_name}</span>
                        {selected ? <Check className="h-4 w-4 flex-shrink-0 text-amber-500" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          )}
          {activeMembership && ['OWNER', 'ADMIN'].includes(activeMembership.role) ? (
            <Link
              to="/staff"
              className="w-10 h-10 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-center bg-white dark:bg-slate-900 rounded-app-control text-slate-700 dark:text-slate-300"
              aria-label="Invite shop staff"
            >
              <Users className="w-5 h-5" />
            </Link>
          ) : null}
          <div className="relative">
            <button
              ref={settingsTriggerRef}
              type="button"
              onClick={() => setOpenMenu((current) => current === 'settings' ? null : 'settings')}
              className={`w-10 h-10 border shadow-sm flex items-center justify-center bg-white dark:bg-slate-900 rounded-app-control transition-colors text-slate-700 dark:text-slate-300 ${
                openMenu === 'settings'
                  ? 'border-amber-500 ring-2 ring-amber-500/25'
                  : 'border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800'
              }`}
              aria-label="Settings"
              aria-haspopup="menu"
              aria-expanded={openMenu === 'settings'}
            >
              <Settings className="w-5 h-5" />
            </button>
            {openMenu === 'settings' ? (
              <div
                role="menu"
                aria-label="Settings"
                className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] space-y-1 rounded-app-surface border border-slate-200 bg-white p-2 shadow-xl animate-fade-in dark:border-slate-800 dark:bg-slate-900"
              >
                <Link
                  to="/subscription"
                  role="menuitem"
                  onClick={() => setOpenMenu(null)}
                  className="flex items-center gap-3 rounded-app-control px-3 py-2.5 text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Crown className="h-5 w-5 flex-shrink-0 text-amber-500" />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{isPro ? 'Aurum Pro' : 'Upgrade to Pro'}</span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{planDescription}</span>
                  </span>
                </Link>
                {!isCloudDistribution ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpenMenu(null);
                      setShowApiSetup(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-app-control px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Server className="h-5 w-5 flex-shrink-0 text-slate-400" />
                    Connect backend
                  </button>
                ) : null}
                <a
                  href={version.data?.source ?? 'https://github.com/duelistraj/aurum-pos'}
                  target="_blank"
                  rel="noreferrer"
                  role="menuitem"
                  onClick={() => setOpenMenu(null)}
                  className="flex items-center gap-3 rounded-app-control px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <ExternalLink className="h-5 w-5 flex-shrink-0 text-slate-400" />
                  View source on GitHub
                </a>
                <div className="border-t border-slate-200 pt-1 dark:border-slate-800">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={loggingOut}
                    onClick={() => void logout()}
                    className="flex w-full items-center gap-3 rounded-app-control px-3 py-2.5 text-left text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <LogOut className="h-5 w-5 flex-shrink-0" />
                    {loggingOut ? 'Logging out…' : 'Log out'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={toggleDarkMode}
            className="w-10 h-10 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-center bg-white dark:bg-slate-900 rounded-app-control hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors duration-150 text-slate-700 dark:text-amber-500"
            aria-label="Toggle Dark Mode"
          >
            {isDarkMode ? (
              <Sun className="w-5 h-5 text-amber-500" />
            ) : (
              <Moon className="w-5 h-5 text-slate-700 dark:text-slate-400" />
            )}
          </button>
        </div>
      </div>
      {showApiSetup && (
        <div className="fixed inset-0 z-50">
          <ApiSetup onConfigured={() => setShowApiSetup(false)} onCancel={() => setShowApiSetup(false)} />
        </div>
      )}
    </header>
  );
};
