import React from 'react';
import { Moon, Server, Sun } from 'lucide-react';
import { useConfig } from '../context/ConfigContext';
import { ApiSetup } from '../pages/ApiSetup';

export const Header: React.FC = () => {
  const { appName, isDarkMode, toggleDarkMode } = useConfig();
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
          <button
            onClick={() => setShowApiSetup(true)}
            className="w-10 h-10 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-center bg-white dark:bg-slate-900 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors duration-150 text-slate-700 dark:text-slate-300"
            aria-label="Backend Settings"
          >
            <Server className="w-5 h-5" />
          </button>
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
