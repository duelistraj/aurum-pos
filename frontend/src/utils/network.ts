import { useSyncExternalStore } from 'react';

const subscribe = (listener: () => void) => {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
};

const getSnapshot = () => navigator.onLine;
const getServerSnapshot = () => true;

export const useNetworkState = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
