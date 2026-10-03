import React from 'react';

const subscribe = (onChange: () => void) => {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
};

const getSnapshot = () => (typeof window === 'undefined' ? 1280 : window.innerWidth);

export const useViewportWidth = () => React.useSyncExternalStore(
  subscribe,
  getSnapshot,
  () => 1280,
);
