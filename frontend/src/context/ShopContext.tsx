import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getActiveShopId,
  getUserInfo,
  MembershipInfo,
  setActiveShopId as persistActiveShopId,
  UserInfo,
} from '../utils/auth';

interface ShopContextValue {
  user: UserInfo | null;
  memberships: MembershipInfo[];
  activeMembership: MembershipInfo | null;
  canManage: boolean;
  selectShop: (shopId: string) => Promise<void>;
  reload: () => Promise<void>;
}

const ShopContext = React.createContext<ShopContextValue | null>(null);

export const ShopProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = React.useState<UserInfo | null>(null);
  const [activeShopId, setActiveShopId] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    const [savedUser, savedShopId] = await Promise.all([getUserInfo(), getActiveShopId()]);
    setUser(savedUser);
    setActiveShopId(savedShopId ?? savedUser?.memberships[0]?.shop_id ?? null);
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const selectShop = React.useCallback(async (shopId: string) => {
    if (!user?.memberships.some((membership) => membership.shop_id === shopId)) return;
    await persistActiveShopId(shopId);
    setActiveShopId(shopId);
    queryClient.clear();
  }, [queryClient, user]);

  const memberships = React.useMemo(() => user?.memberships ?? [], [user]);
  const activeMembership = memberships.find(({ shop_id }) => shop_id === activeShopId) ?? null;
  const canManage = activeMembership
    ? ['OWNER', 'ADMIN', 'MANAGER'].includes(activeMembership.role)
    : false;

  const value = React.useMemo(() => ({
    user,
    memberships,
    activeMembership,
    canManage,
    selectShop,
    reload,
  }), [user, memberships, activeMembership, canManage, selectShop, reload]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useShop = (): ShopContextValue => {
  const value = React.useContext(ShopContext);
  if (!value) throw new Error('useShop must be used inside ShopProvider');
  return value;
};
