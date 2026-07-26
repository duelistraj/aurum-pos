import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { getApiBaseUrl } from '../utils/apiConfig';
import { getLocalValue, setLocalValue } from '../utils/storage';

interface ConfigContextType {
  appName: string;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const ConfigContext = createContext<ConfigContextType>({
  appName: 'Aurum POS',
  isDarkMode: false,
  toggleDarkMode: () => {},
});

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [appName, setAppName] = useState<string>(() => {
    return getLocalValue('app_name') || 'Aurum POS';
  });

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const storedTheme = getLocalValue('theme');
    return storedTheme === 'dark' ||
      (storedTheme === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        if (!(await getApiBaseUrl())) {
          return;
        }
        const data = await apiClient.health();
        if (data && data.app) {
          setAppName(data.app);
          setLocalValue('app_name', data.app);
          document.title = `${data.app} - Inventory & Sales Management`;
        }
      } catch (err) {
        console.error('Failed to fetch app configuration:', err);
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      setLocalValue('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      setLocalValue('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode((prev) => !prev);

  return (
    <ConfigContext.Provider value={{ appName, isDarkMode, toggleDarkMode }}>
      {children}
    </ConfigContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useConfig = () => useContext(ConfigContext);
