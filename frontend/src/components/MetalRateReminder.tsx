import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { formatMetalName } from '../features/metalRates/display';
import { getStaleConfiguredRates } from '../features/metalRates/reminder';
import { useShop } from '../context/ShopContext';
import { MetalRate } from '../types';
import {
  getIndiaDateKey,
  getNextRateReminderAt,
  isAtOrAfterRateReminderTime,
} from '../utils/indiaTime';
import { getPreference, setPreference } from '../utils/storage';
import { Button, Modal } from './UI';

const REMINDER_PREFERENCE_PREFIX = 'metal-rate-reminder';

const getReminderPreferenceKey = (
  userId: string,
  shopId: string,
  dateKey: string,
): string => `${REMINDER_PREFERENCE_PREFIX}:${userId}:${shopId}:${dateKey}`;

const formatMetalList = (names: readonly string[]): string => {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
};

export const MetalRateReminder: React.FC = () => {
  const { activeMembership, canManage, user } = useShop();
  const shopId = activeMembership?.shop_id ?? '';
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [now, setNow] = React.useState(() => new Date());
  const [staleRates, setStaleRates] = React.useState<MetalRate[]>([]);
  const ratesQuery = useQuery<MetalRate[]>({
    queryKey: queryKeys.metalRates(shopId),
    queryFn: () => apiClient.getAllMetalRates(),
    enabled: Boolean(shopId && canManage),
  });

  React.useEffect(() => {
    if (!shopId || !canManage) return undefined;
    let timeout = 0;
    const scheduleReminderCheck = () => {
      const current = new Date();
      const delay = Math.max(
        1_000,
        getNextRateReminderAt(current).getTime() - current.getTime() + 50,
      );
      timeout = window.setTimeout(() => {
        setNow(new Date());
        void queryClient.invalidateQueries({ queryKey: queryKeys.metalRates(shopId) });
        scheduleReminderCheck();
      }, delay);
    };
    scheduleReminderCheck();
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      window.clearTimeout(timeout);
      setNow(new Date());
      void queryClient.invalidateQueries({ queryKey: queryKeys.metalRates(shopId) });
      scheduleReminderCheck();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [canManage, queryClient, shopId]);

  const currentDateKey = getIndiaDateKey(now);
  React.useEffect(() => {
    let active = true;
    setStaleRates([]);
    if (
      !shopId
      || !user?.user_id
      || !canManage
      || location.pathname === '/rates'
      || !isAtOrAfterRateReminderTime(now)
      || !ratesQuery.isSuccess
    ) return () => { active = false; };

    const configuredRates = ratesQuery.data.filter((rate) => Number(rate.purity) === 100);
    const dueRates = getStaleConfiguredRates(configuredRates, now);
    if (configuredRates.length === 0 || dueRates.length === 0) {
      return () => { active = false; };
    }

    const preferenceKey = getReminderPreferenceKey(user.user_id, shopId, currentDateKey);
    void getPreference(preferenceKey).then((acknowledged) => {
      if (active && acknowledged !== 'acknowledged') setStaleRates(dueRates);
    });
    return () => { active = false; };
  }, [
    canManage,
    currentDateKey,
    location.pathname,
    now,
    ratesQuery.data,
    ratesQuery.isSuccess,
    shopId,
    user?.user_id,
  ]);

  const acknowledge = async (openRates: boolean) => {
    if (!shopId || !user?.user_id) return;
    setStaleRates([]);
    await setPreference(
      getReminderPreferenceKey(user.user_id, shopId, getIndiaDateKey(new Date())),
      'acknowledged',
    );
    if (openRates) navigate('/rates');
  };

  const metalNames = staleRates.map(({ metal }) => formatMetalName(metal));
  const metalList = formatMetalList(metalNames);

  return (
    <Modal
      isOpen={staleRates.length > 0}
      title="Update today's metal rates"
      onClose={() => void acknowledge(false)}
      footer={(
        <>
          <Button variant="secondary" onClick={() => void acknowledge(false)}>Not now</Button>
          <Button onClick={() => void acknowledge(true)}>Update rates</Button>
        </>
      )}
    >
      <p className="metal-rate-reminder__message">
        The configured {metalList} {staleRates.length === 1 ? 'rate has' : 'rates have'} not been updated today.
      </p>
      <p className="metal-rate-reminder__context">
        Refresh today&apos;s rates before creating sales so pricing stays accurate.
      </p>
    </Modal>
  );
};
