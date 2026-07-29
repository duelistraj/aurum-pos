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

type BillingAvailability = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

const PLAN_NAME_BY_ID: Readonly<Record<string, string>> = {
  monthly: 'Monthly',
  yearly: 'Yearly',
};

const PERIOD_LABEL_BY_VALUE: Readonly<Record<string, string>> = {
  P1M: 'per month',
  P1Y: 'per year',
};

export const Subscription: React.FC = () => {
  const queryClient = useQueryClient();
  const { user, activeMembership } = useShop();
  const [offers, setOffers] = React.useState<Offer[]>([]);
  const [billingAvailability, setBillingAvailability] =
    React.useState<BillingAvailability>('idle');
  const [billingError, setBillingError] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const shopId = activeMembership?.shop_id ?? '';
  const entitlement = useQuery({
    queryKey: queryKeys.entitlement(shopId),
    queryFn: () => apiClient.getEntitlement(),
    enabled: Boolean(shopId),
  });

  React.useEffect(() => {
    if (
      !isCloudDistribution
      || Capacitor.getPlatform() !== 'android'
      || activeMembership?.role !== 'OWNER'
      || entitlement.data?.plan === 'pro'
    ) return;
    setBillingAvailability('loading');
    setBillingError('');
    void AurumBilling.getProducts({ productId: PLAY_PRODUCT_ID })
      .then(({ products }) => {
        const offerByBasePlan = new Map(
          (products[0]?.offers ?? []).map((offer) => [offer.basePlanId, offer]),
        );
        const availableOffers = Array.from(offerByBasePlan.values());
        setOffers(availableOffers);
        setBillingAvailability(availableOffers.length > 0 ? 'ready' : 'unavailable');
      })
      .catch((caught: unknown) => {
        setBillingAvailability('error');
        setBillingError(
          caught instanceof Error
            ? caught.message
            : 'Google Play Billing is temporarily unavailable.',
        );
      });
  }, [activeMembership?.role, entitlement.data?.plan]);

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
        obfuscatedProfileId: await sha256(activeMembership.organization_id),
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
          // A Google account can hold purchases for several organizations.
          // The server accepts only the token linked to the selected organization.
        }
      }
      if (restoredCount === 0) {
        throw new Error('No purchase belongs to this organization.');
      }
      await refreshEntitlement();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  if (entitlement.isPending) return <Loader />;
  if (!activeMembership) return <Alert type="error" message="Select a shop first." />;

  return (
    <div className="app-page app-page__container mx-auto max-w-2xl space-y-5 p-6 text-slate-900 dark:text-slate-100">
      <div className="app-page__header app-page__header--stacked">
        <h1>Aurum Cloud</h1>
        <p>Manage your organization's plan and Google Play purchases.</p>
      </div>
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
          {entitlement.data && (
            <div className="grid gap-3 pt-2 sm:grid-cols-2">
              <div className="rounded-app-control bg-slate-50 p-4 dark:bg-slate-950">
                <p className="text-sm text-slate-500 dark:text-slate-400">Shops</p>
                <p className="mt-1 font-bold">
                  {entitlement.data.shop_count}
                  {entitlement.data.shop_limit === null
                    ? ' active'
                    : ` of ${entitlement.data.shop_limit}`}
                </p>
              </div>
              <div className="rounded-app-control bg-slate-50 p-4 dark:bg-slate-950">
                <p className="text-sm text-slate-500 dark:text-slate-400">Team seats</p>
                <p className="mt-1 font-bold">
                  {entitlement.data.team_seat_usage}
                  {entitlement.data.team_seat_limit === null
                    ? ' used'
                    : ` of ${entitlement.data.team_seat_limit}`}
                </p>
              </div>
            </div>
          )}
          {entitlement.data?.expires_at && (
            <p className="text-slate-600 dark:text-slate-300">
              Pro until {new Date(entitlement.data.expires_at).toLocaleDateString()}
            </p>
          )}
        </div>
      </Card>

      {activeMembership.role === 'OWNER'
        && isCloudDistribution
        && entitlement.data?.plan !== 'pro' && (
        <>
          {Capacitor.getPlatform() !== 'android' && (
            <Alert
              type="info"
              title="Google Play required"
              message="Open Aurum POS from Google Play on Android to purchase or restore Pro."
            />
          )}
          {Capacitor.getPlatform() === 'android' && billingAvailability === 'loading' && (
            <Card className="p-6">
              <p className="font-semibold">Loading Google Play plans...</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Prices and availability come directly from Google Play.
              </p>
            </Card>
          )}
          {Capacitor.getPlatform() === 'android' && billingAvailability === 'unavailable' && (
            <Alert
              type="warning"
              title="Pro is not available yet"
              message="Google Play did not return an active Aurum Cloud Pro plan. Try again after the subscription has been published."
            />
          )}
          {Capacitor.getPlatform() === 'android' && billingAvailability === 'error' && (
            <Alert
              type="error"
              title="Google Play Billing unavailable"
              message={billingError}
            />
          )}
          {Capacitor.getPlatform() === 'android' && billingAvailability === 'ready' && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {offers.map((offer) => {
                  const planName = PLAN_NAME_BY_ID[offer.basePlanId] ?? offer.basePlanId;
                  const periodLabel =
                    PERIOD_LABEL_BY_VALUE[offer.billingPeriod ?? ''] ?? 'per billing period';
                  return (
                    <Card key={offer.basePlanId} className="flex flex-col p-6">
                      <h2 className="text-lg font-semibold">{planName}</h2>
                      <p className="my-3 text-2xl font-bold">
                        {offer.formattedPrice ?? 'See Google Play'}
                      </p>
                      <p className="mb-5 text-sm text-slate-600 dark:text-slate-300">
                        {periodLabel}. Renews automatically until cancelled in Google Play.
                      </p>
                      <Button
                        className="mt-auto"
                        onClick={() => void purchase(offer.basePlanId)}
                        disabled={busy}
                      >
                        Choose {planName}
                      </Button>
                    </Card>
                  );
                })}
              </div>
              <Button variant="secondary" onClick={() => void restore()} disabled={busy}>
                Restore purchases
              </Button>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Payment is charged by Google Play. You can cancel from your Play subscriptions.
              </p>
            </div>
          )}
        </>
      )}
      {activeMembership.role === 'OWNER'
        && isCloudDistribution
        && entitlement.data?.plan === 'pro' && (
        <Alert
          type="success"
          title="Pro is active for your organization"
          message="All organization shops share this entitlement. Manage renewal from Google Play subscriptions."
        />
      )}
      {activeMembership.role !== 'OWNER' && isCloudDistribution && (
        <Alert
          type="info"
          title="Owner access required"
          message="Only the organization owner can purchase or restore Aurum Cloud Pro."
        />
      )}
      {!isCloudDistribution && (
        <Alert
          type="success"
          message="Self-hosted Aurum POS includes unlimited shops, team seats, and active inventory."
        />
      )}
    </div>
  );
};
