import React from 'react';
import { ExternalLink, Moon, Server, Sun, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { useConfig } from '../context/ConfigContext';
import { useShop } from '../context/ShopContext';
import { ApiSetup } from '../pages/ApiSetup';
import { isCloudDistribution } from '../utils/apiConfig';

export const Header: React.FC = () => {
  const { appName, isDarkMode, toggleDarkMode } = useConfig();
  const { activeMembership, memberships, selectShop } = useShop();
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
  const [showApiSetup, setShowApiSetup] = React.useState(false);
  const firstLetter = (appName || 'Jewellery POS').charAt(0).toUpperCase();

  return (
    <header className="w-full bg-transparent flex-shrink-0">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
            <span className="font-bold text-white text-xl">{firstLetter}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">
            {appName || 'Jewellery POS'}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {memberships.length > 0 && (
            <select
              aria-label="Active shop"
              className="max-w-44 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
              value={shopId}
              onChange={(event) => void selectShop(event.target.value)}
            >
              {memberships.map((membership) => (
                <option key={membership.shop_id} value={membership.shop_id}>
                  {membership.shop_name}
                </option>
              ))}
            </select>
          )}
          {entitlement.data && (
            <Link to="/subscription" className="hidden sm:inline rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              {entitlement.data.plan === 'premium'
                ? 'Premium'
                : `${entitlement.data.active_item_count}/${entitlement.data.active_item_limit}`}
            </Link>
          )}
          {activeMembership && ['OWNER', 'ADMIN'].includes(activeMembership.role) ? (
            <Link
              to="/staff"
              className="w-10 h-10 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-center bg-white dark:bg-slate-900 rounded-xl"
              aria-label="Invite shop staff"
            >
              <Users className="w-5 h-5" />
            </Link>
          ) : null}
          {!isCloudDistribution && <button
            onClick={() => setShowApiSetup(true)}
            className="w-10 h-10 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-center bg-white dark:bg-slate-900 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors duration-150 text-slate-700 dark:text-slate-300"
            aria-label="Backend Settings"
          >
            <Server className="w-5 h-5" />
          </button>}
          <a
            href={version.data?.source ?? 'https://github.com/duelistraj/aurum-pos'}
            target="_blank"
            rel="noreferrer"
            className="w-10 h-10 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-center bg-white dark:bg-slate-900 rounded-xl"
            aria-label="Aurum POS source code (AGPL-3.0-only)"
          >
            <ExternalLink className="w-5 h-5" />
          </a>
          <button
            onClick={toggleDarkMode}
            className="w-10 h-10 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-center bg-white dark:bg-slate-900 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors duration-150 text-slate-700 dark:text-amber-500"
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
