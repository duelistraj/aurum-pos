import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { getApiBaseUrl } from '../utils/apiConfig';

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
    return localStorage.getItem('app_name') || 'Aurum POS';
  });

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('theme') === 'dark' || 
      (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
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
          localStorage.setItem('app_name', data.app);
          document.title = `${data.app} - Inventory & Sales Management`;
        }
      } catch (err) {
        console.error('Failed to fetch app configuration:', err);
      }
    };
    fetchConfig();
    window.addEventListener('api-url-changed', fetchConfig);
    return () => window.removeEventListener('api-url-changed', fetchConfig);
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode((prev) => !prev);

  return (
    <ConfigContext.Provider value={{ appName, isDarkMode, toggleDarkMode }}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = () => useContext(ConfigContext);
