import React from 'react';
import { Capacitor } from '@capacitor/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { Card, Button, Alert, Loader } from '../components/UI';
import { useShop } from '../context/ShopContext';
import { AurumBilling, PLAY_PRODUCT_ID, sha256 } from '../native/billing';
import { isCloudDistribution } from '../utils/apiConfig';

interface Offer {
  basePlanId: string;
  formattedPrice?: string;
  billingPeriod?: string;
}

export const Subscription: React.FC = () => {
  const queryClient = useQueryClient();
  const { user, activeMembership } = useShop();
  const [offers, setOffers] = React.useState<Offer[]>([]);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [deleteOwnedShops, setDeleteOwnedShops] = React.useState(false);
  const [deletionMessage, setDeletionMessage] = React.useState('');
  const shopId = activeMembership?.shop_id ?? '';
  const entitlement = useQuery({
    queryKey: queryKeys.entitlement(shopId),
    queryFn: () => apiClient.getEntitlement(),
    enabled: Boolean(shopId),
  });

  React.useEffect(() => {
    if (!isCloudDistribution || Capacitor.getPlatform() !== 'android') return;
    void AurumBilling.getProducts({ productId: PLAY_PRODUCT_ID })
      .then(({ products }) => setOffers(products[0]?.offers ?? []))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Billing unavailable'));
  }, []);

  const refreshEntitlement = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.entitlement(shopId) });
  };

  const purchase = async (basePlanId: string) => {
    if (!user || !activeMembership) return;
    setBusy(true);
    setError('');
    try {
      const result = await AurumBilling.purchase({
        productId: PLAY_PRODUCT_ID,
        basePlanId,
        obfuscatedAccountId: await sha256(user.user_id),
        obfuscatedProfileId: await sha256(activeMembership.shop_id),
      });
      await apiClient.submitPlayPurchase(result.purchaseToken);
      await refreshEntitlement();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Purchase failed');
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    setError('');
    try {
      const { purchases } = await AurumBilling.restore();
      let restoredCount = 0;
      for (const purchaseResult of purchases) {
        try {
          await apiClient.submitPlayPurchase(purchaseResult.purchaseToken);
          restoredCount += 1;
        } catch {
          // A Google account can hold purchases for several Aurum shops.
          // The server accepts only the token linked to the selected shop.
        }
      }
      if (restoredCount === 0) throw new Error('No purchase belongs to this shop.');
      await refreshEntitlement();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  const requestDeletion = async () => {
    if (!user || !window.confirm('Email a confirmation link to schedule account deletion?')) return;
    setBusy(true);
    try {
      const result = await apiClient.requestAccountDeletion(user.email, deleteOwnedShops);
      setDeletionMessage(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Deletion request failed');
    } finally {
      setBusy(false);
    }
  };

  if (entitlement.isPending) return <Loader />;
  if (!activeMembership) return <Alert type="error" message="Select a shop first." />;

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6 text-slate-900 dark:text-slate-100">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Aurum Cloud</h1>
      {error && <Alert type="error" message={error} />}
      <Card className="p-6">
        <div className="space-y-3">
          <p className="text-lg font-semibold">
            Current plan: {entitlement.data?.plan === 'pro' ? 'Pro' : 'Free'}
          </p>
          {entitlement.data?.active_item_limit && (
            <p className="text-slate-600 dark:text-slate-300">
              {entitlement.data.active_item_count} of {entitlement.data.active_item_limit} active items
            </p>
          )}
          {entitlement.data?.expires_at && (
            <p className="text-slate-600 dark:text-slate-300">
              Pro until {new Date(entitlement.data.expires_at).toLocaleDateString()}
            </p>
          )}
        </div>
      </Card>

      {activeMembership.role === 'OWNER' && isCloudDistribution && (
        <div className="grid gap-4 sm:grid-cols-2">
          {offers.map((offer) => (
            <Card key={offer.basePlanId} className="p-6">
              <h2 className="font-semibold capitalize">{offer.basePlanId}</h2>
              <p className="my-3 text-2xl font-bold">{offer.formattedPrice ?? 'See Google Play'}</p>
              <Button onClick={() => void purchase(offer.basePlanId)} disabled={busy}>
                Choose {offer.basePlanId}
              </Button>
            </Card>
          ))}
          <Button variant="secondary" onClick={() => void restore()} disabled={busy}>
            Restore purchases
          </Button>
        </div>
      )}
      {!isCloudDistribution && (
        <Alert type="success" message="Self-hosted Aurum POS includes unlimited active inventory." />
      )}
      <Card className="p-6">
        <h2 className="font-semibold">Account</h2>
        <label className="my-3 flex gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={deleteOwnedShops}
            onChange={(event) => setDeleteOwnedShops(event.target.checked)}
            className="checkbox-round"
          />
          Delete shops for which I am the sole owner
        </label>
        <Button variant="danger" onClick={() => void requestDeletion()} disabled={busy}>
          Request account deletion
        </Button>
        {deletionMessage && (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{deletionMessage}</p>
        )}
      </Card>
    </div>
  );
};
