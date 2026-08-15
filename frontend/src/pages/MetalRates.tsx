import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, ChevronDown, Plus } from 'lucide-react';
import {
  Card,
  Button,
  Input,
  Alert,
  Modal,
  Loader,
  Badge,
} from '../components/UI';
import { apiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { useShop } from '../context/ShopContext';
import { MetalRate } from '../types';
import { removeLocalValue } from '../utils/storage';

interface RateWithId extends MetalRate {
  id?: string;
}

const EMPTY_METALS: Record<string, number[]> = {};

export const MetalRates: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeMembership, canManage } = useShop();
  const shopId = activeMembership?.shop_id ?? '';
  const [error, setError] = React.useState<string>('');
  const [success, setSuccess] = React.useState<string>('');
  const [showModal, setShowModal] = React.useState(false);
  const [formData, setFormData] = React.useState({
    metal: '',
    rate_per_gram: '',
  });
  const [showMetalDropdown, setShowMetalDropdown] = React.useState(false);
  const metalDropdownRef = React.useRef<HTMLDivElement>(null);

  const ratesQuery = useQuery<RateWithId[]>({
    queryKey: queryKeys.metalRates(shopId),
    queryFn: () => apiClient.getAllMetalRates(),
    enabled: Boolean(shopId),
  });
  const metalsQuery = useQuery<Record<string, number[]>>({
    queryKey: queryKeys.availableMetals(shopId),
    queryFn: () => apiClient.getAvailableMetals(),
    enabled: Boolean(shopId),
  });
  const updateRate = useMutation({
    mutationFn: (rate: MetalRate) => apiClient.addMetalRate(rate),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.metalRates(shopId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(shopId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.cashierDashboard(shopId) }),
      queryClient.invalidateQueries({ queryKey: ['shops', shopId, 'dashboard', 'analytics'] }),
      queryClient.invalidateQueries({ queryKey: ['shops', shopId, 'change-log'] }),
    ]),
  });
  const rates = ratesQuery.data ?? [];
  const availableMetals = metalsQuery.data ?? EMPTY_METALS;
  const metals = Object.keys(availableMetals).map((metal) => ({
    value: metal,
    label: metal.charAt(0).toUpperCase() + metal.slice(1),
  }));
  const hasRateForAllMetals = metals.length > 0 && metals.every((metal) => (
    rates.some((rate) => rate.metal.toLowerCase() === metal.value.toLowerCase() && Number(rate.purity) === 100)
  ));
  const loading = ratesQuery.isPending || metalsQuery.isPending || updateRate.isPending;
  const queryError = ratesQuery.error ?? metalsQuery.error;
  const visibleError = error || (queryError instanceof Error ? queryError.message : '');

  React.useEffect(() => {
    removeLocalValue('metal_rates');
    const defaultMetal = Object.keys(availableMetals)[0] ?? '';
    setFormData((previous) => previous.metal ? previous : { ...previous, metal: defaultMetal });
  }, [availableMetals]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (metalDropdownRef.current && !metalDropdownRef.current.contains(event.target as Node)) {
        setShowMetalDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.metal) {
      setError('Metal type is required');
      return;
    }
    if (!formData.rate_per_gram || Number(formData.rate_per_gram) <= 0) {
      setError('Rate per gram is required');
      return;
    }

    try {
      const rateData = {
        metal: formData.metal,
        purity: 100,
        rate_per_gram: parseFloat(formData.rate_per_gram),
      };

      await updateRate.mutateAsync(rateData);

      setSuccess('Metal rate updated successfully');
      setTimeout(() => setSuccess(''), 3000);
      setShowModal(false);
      
      // Reset form to first available metal
      const metalKeys = Object.keys(availableMetals);
      if (metalKeys.length > 0) {
        setFormData({
          metal: metalKeys[0],
          rate_per_gram: '',
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update rate'
      );
    }
  };

  const handleAddRateClick = () => {
    if (!canManage) {
      setError('Your shop role does not allow rate changes.');
      return;
    }
    const metalKeys = Object.keys(availableMetals);
    setFormData({
      metal: metalKeys[0] || '',
      rate_per_gram: '',
    });
    setShowModal(true);
  };

  const handleUpdateClick = (rate: RateWithId) => {
    if (!canManage) {
      setError('Your shop role does not allow rate changes.');
      return;
    }
    const selectedMetal = metals.find((metal) => metal.value.toLowerCase() === rate.metal.toLowerCase())?.value ?? rate.metal;
    setFormData({
      metal: selectedMetal,
      rate_per_gram: String(rate.rate_per_gram),
    });
    setShowModal(true);
  };

  return (
    <div className="app-page min-h-screen bg-transparent text-slate-800 dark:text-slate-100 transition-colors duration-200">
      <div className="app-page__container max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="app-page__header metal-rates-page__header mb-8 animate-slide-down">
          <div className="metal-rates-page__title">
              <h1 className="text-4xl font-bold text-slate-900 dark:text-white">Metal Rates</h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                {canManage ? 'Update current market prices for metals' : 'View current market prices for metals'}
              </p>
          </div>
          {canManage ? <div className="metal-rates-page__actions">
            <Button
              onClick={handleAddRateClick}
              disabled={metals.length === 0 || hasRateForAllMetals}
              className="flex items-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>Add Rate</span>
            </Button>
          </div> : null}
        </div>

        {/* Alerts */}
        {(visibleError || success || (Object.keys(availableMetals).length === 0 && !loading)) && (
          <div className="mb-6 space-y-3">
            {visibleError && (
              <Alert
                type="error"
                title="Error"
                message={visibleError}
                onClose={() => setError('')}
              />
            )}
            {success && (
              <Alert
                type="success"
                title="Success"
                message={success}
                onClose={() => setSuccess('')}
              />
            )}
            {Object.keys(availableMetals).length === 0 && !loading && (
              <Alert
                type="warning"
                title="No Metals Available"
                message="No supported metal types are currently available for rate configuration."
                onClose={() => {}}
              />
            )}
          </div>
        )}

        {/* Rate Cards Grid */}
        {loading && !rates.length ? (
          <div className="flex justify-center py-12">
            <Loader />
          </div>
        ) : rates.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8 animate-slide-up">
            {rates.map((rate) => (
              <Card
                key={`${rate.metal}-${rate.purity}`}
                className="p-6 hover:shadow-lg transition-all duration-200"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      {rate.metal.charAt(0).toUpperCase() + rate.metal.slice(1)}
                    </h3>
                    <Badge variant="info">{rate.purity}%</Badge>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="app-rate-highlight p-4 rounded-app-inset">
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Rate per gram</p>
                    <p className="text-3xl font-bold text-amber-600 dark:text-amber-500">
                      ₹{rate.rate_per_gram.toFixed(2)}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-slate-500 dark:text-slate-400">10g value</p>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        ₹{(rate.rate_per_gram * 10).toFixed(0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 dark:text-slate-400">100g value</p>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        ₹{(rate.rate_per_gram * 100).toFixed(0)}
                      </p>
                    </div>
                  </div>

                  {canManage ? (
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() => handleUpdateClick(rate)}
                      className="w-full py-2.5 rounded-app-control font-semibold shadow-xs"
                    >
                      Update
                    </Button>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        ) : null}

        {rates.length === 0 && !loading && (
          <Card className="p-12 text-center animate-slide-up">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-slate-400" />
            <p className="text-lg text-slate-600 dark:text-slate-400">
              No metal rates found. Add your first rate to get started.
            </p>
          </Card>
        )}

        {/* Add/Edit Rate Modal */}
      <Modal
        isOpen={canManage && showModal}
          title={`${formData.rate_per_gram ? 'Update' : 'Add'} Metal Rate`}
          onClose={() => setShowModal(false)}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setShowModal(false)}
                className="rounded-app-control px-5"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                isLoading={loading}
                className="rounded-app-control px-5"
              >
                {formData.rate_per_gram ? 'Update Rate' : 'Add Rate'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Metal Type
              </label>
              <div className="relative" ref={metalDropdownRef}>
                <button
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={showMetalDropdown}
                  onClick={() => setShowMetalDropdown((open) => !open)}
                  className="metal-rate-dropdown__trigger"
                >
                  <span>{metals.find((metal) => metal.value === formData.metal)?.label || 'Select metal'}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showMetalDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showMetalDropdown && (
                  <div className="metal-rate-dropdown__menu" role="listbox" aria-label="Metal type">
                    {metals.map((metal) => {
                      const isSelected = metal.value === formData.metal;
                      return (
                        <button
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          key={metal.value}
                          onClick={() => {
                            setFormData({ ...formData, metal: metal.value });
                            setShowMetalDropdown(false);
                          }}
                          className={`metal-rate-dropdown__option ${isSelected ? 'is-selected' : ''}`}
                        >
                          <span>{metal.label}</span>
                          {isSelected && <Check className="w-4 h-4" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-app-inset border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4">
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Purity</p>
              <p className="text-slate-900 dark:text-white font-semibold">100% base rate</p>
            </div>

            <Input
              id="metal-rate-per-gram"
              label="Rate per Gram (₹) *"
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="0.00"
              value={formData.rate_per_gram}
              onChange={(e) =>
                setFormData({ ...formData, rate_per_gram: e.target.value })
              }
              required
              className="py-2.5 rounded-app-control"
            />

            {formData.rate_per_gram && (
              <Card className="p-4 bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Quick Reference:</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-slate-500 dark:text-slate-400">5g</p>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      ₹{(parseFloat(formData.rate_per_gram) * 5).toFixed(0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500 dark:text-slate-400">10g</p>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      ₹{(parseFloat(formData.rate_per_gram) * 10).toFixed(0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500 dark:text-slate-400">100g</p>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      ₹{(parseFloat(formData.rate_per_gram) * 100).toFixed(0)}
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </form>
        </Modal>

      </div>
    </div>
  );
};
