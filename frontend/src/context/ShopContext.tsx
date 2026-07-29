import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient, setRequestShopId } from '../api/client';
import {
  getActiveShopId,
  clearActiveShopId,
  getUserInfo,
  MembershipInfo,
  setActiveShopId as persistActiveShopId,
  setUserInfo,
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
    let currentUser = savedUser;
    if (savedUser) {
      try {
        const shops = await apiClient.listShops();
        currentUser = {
          ...savedUser,
          memberships: shops.map((shop) => ({
            shop_id: shop.id,
            organization_id: shop.organization_id,
            organization_name: shop.organization_name,
            is_primary: shop.is_primary,
            access_mode: shop.access_mode,
            shop_name: shop.name,
            shop_slug: shop.slug,
            role: shop.role as MembershipInfo['role'],
          })),
        };
        await setUserInfo(currentUser);
      } catch {
        // Cached memberships keep the app usable during a transient API outage.
      }
    }
    setUser(currentUser);
    const selectedShopId = currentUser?.memberships.some(
      ({ shop_id }) => shop_id === savedShopId,
    )
      ? savedShopId
      : currentUser?.memberships[0]?.shop_id ?? null;
    if (selectedShopId && selectedShopId !== savedShopId) {
      await persistActiveShopId(selectedShopId);
    } else if (!selectedShopId && savedShopId) {
      await clearActiveShopId();
    }
    setRequestShopId(selectedShopId);
    setActiveShopId(selectedShopId);
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const selectShop = React.useCallback(async (shopId: string) => {
    if (!user?.memberships.some((membership) => membership.shop_id === shopId)) return;
    setRequestShopId(shopId);
    await persistActiveShopId(shopId);
    setActiveShopId(shopId);
    queryClient.clear();
  }, [queryClient, user]);

  const memberships = React.useMemo(() => user?.memberships ?? [], [user]);
  const activeMembership = memberships.find(({ shop_id }) => shop_id === activeShopId) ?? null;
  const canManage = activeMembership
    ? activeMembership.access_mode !== 'read_only'
      && ['OWNER', 'ADMIN', 'MANAGER'].includes(activeMembership.role)
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
