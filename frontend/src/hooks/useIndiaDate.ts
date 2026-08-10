import React from 'react';
import { formatLongIndiaDate, getNextIndiaMidnightAt } from '../utils/indiaTime';

export const useIndiaDate = (): string => {
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    let timeout = 0;
    const scheduleMidnightUpdate = () => {
      const current = new Date();
      const delay = Math.max(1_000, getNextIndiaMidnightAt(current).getTime() - current.getTime() + 50);
      timeout = window.setTimeout(() => {
        setNow(new Date());
        scheduleMidnightUpdate();
      }, delay);
    };
    scheduleMidnightUpdate();
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      window.clearTimeout(timeout);
      setNow(new Date());
      scheduleMidnightUpdate();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return formatLongIndiaDate(now);
};
