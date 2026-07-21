import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, AlertCircle } from 'lucide-react';
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
import { MetalRate } from '../types';
import { removeLocalValue } from '../utils/storage';

interface RateWithId extends MetalRate {
  id?: string;
}

const EMPTY_METALS: Record<string, number[]> = {};

export const MetalRates: React.FC = () => {
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string>('');
  const [success, setSuccess] = React.useState<string>('');
  const [showModal, setShowModal] = React.useState(false);
  const [showPasswordModal, setShowPasswordModal] = React.useState(false);
  const [passwordInput, setPasswordInput] = React.useState('');
  const [passwordError, setPasswordError] = React.useState('');
  const [pendingUpdateRate, setPendingUpdateRate] = React.useState<RateWithId | null>(null);
  const [formData, setFormData] = React.useState({
    metal: '',
    rate_per_gram: '',
  });

  const ratesQuery = useQuery<RateWithId[]>({
    queryKey: queryKeys.metalRates,
    queryFn: () => apiClient.getAllMetalRates(),
  });
  const metalsQuery = useQuery<Record<string, number[]>>({
    queryKey: queryKeys.availableMetals,
    queryFn: () => apiClient.getAvailableMetals(),
  });
  const updateRate = useMutation({
    mutationFn: (rate: MetalRate) => apiClient.addMetalRate(rate),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.metalRates }),
  });
  const rates = ratesQuery.data ?? [];
  const availableMetals = metalsQuery.data ?? EMPTY_METALS;
  const loading = ratesQuery.isPending || metalsQuery.isPending || updateRate.isPending;
  const queryError = ratesQuery.error ?? metalsQuery.error;
  const visibleError = error || (queryError instanceof Error ? queryError.message : '');

  React.useEffect(() => {
    removeLocalValue('metal_rates');
    const defaultMetal = Object.keys(availableMetals)[0] ?? '';
    setFormData((previous) => previous.metal ? previous : { ...previous, metal: defaultMetal });
  }, [availableMetals]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.rate_per_gram) {
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

  const metals = Object.keys(availableMetals).map((metal) => ({
    value: metal,
    label: metal.charAt(0).toUpperCase() + metal.slice(1),
  }));

  const handleAddRateClick = () => {
    const metalKeys = Object.keys(availableMetals);
    setFormData({
      metal: metalKeys[0] || '',
      rate_per_gram: '',
    });
    setShowModal(true);
  };

  const handleUpdateClick = (rate: RateWithId) => {
    setPendingUpdateRate(rate);
    setPasswordInput('');
    setPasswordError('');
    setShowPasswordModal(true);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await apiClient.verifyManagerPassword(passwordInput.trim());
      if (response.valid) {
        setShowPasswordModal(false);
        if (pendingUpdateRate) {
          setFormData({
            metal: pendingUpdateRate.metal,
            rate_per_gram: String(pendingUpdateRate.rate_per_gram),
          });
          setShowModal(true);
          setPendingUpdateRate(null);
        }
        setPasswordInput('');
        setPasswordError('');
      } else {
        setPasswordError('Incorrect password. Please try again.');
      }
    } catch (err) {
      setPasswordError((err as Error).message || 'Verification failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-transparent text-slate-800 dark:text-slate-100 transition-colors duration-200">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 animate-slide-down">
          <div className="flex justify-between items-center mb-2">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 dark:text-white">Metal Rates</h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                Update current market prices for metals
              </p>
            </div>
            <Button
              onClick={handleAddRateClick}
              disabled={Object.keys(availableMetals).length === 0 || rates.some(r => r.metal === 'Silver' && r.purity === 100)}
              className="flex items-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>Add Rate</span>
            </Button>
          </div>
        </div>

        {/* Alerts */}
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

        {/* No Metals Warning */}
        {Object.keys(availableMetals).length === 0 && !loading && (
          <Alert
            type="warning"
            title="No Metals Available"
            message="Please add metal types and their purities through system settings before adding rates."
            onClose={() => {}}
          />
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
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-slate-800 dark:to-slate-800/80 p-4 rounded-lg">
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

                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => handleUpdateClick(rate)}
                    className="w-full py-2.5 rounded-xl font-semibold shadow-xs"
                  >
                    Update
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : null}

        {rates.length === 0 && !loading && (
          <Card className="p-12 text-center animate-slide-up">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-slate-400" />
            <p className="text-slate-600 text-lg">
              No metal rates found. Add your first rate to get started.
            </p>
          </Card>
        )}

        {/* Add/Edit Rate Modal */}
        <Modal
          isOpen={showModal}
          title={`${formData.rate_per_gram ? 'Update' : 'Add'} Metal Rate`}
          onClose={() => setShowModal(false)}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setShowModal(false)}
                className="rounded-xl px-5"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                isLoading={loading}
                className="rounded-xl px-5"
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
              <select
                value={formData.metal}
                onChange={(e) => {
                  const selectedMetal = e.target.value;
                  setFormData({
                    ...formData,
                    metal: selectedMetal,
                  });
                }}
                className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all duration-200"
              >
                {metals.map((metal) => (
                  <option key={metal.value} value={metal.value}>
                    {metal.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4">
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Purity</p>
              <p className="text-slate-900 dark:text-white font-semibold">100%</p>
            </div>

            <Input
              label="Rate per Gram (₹) *"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formData.rate_per_gram}
              onChange={(e) =>
                setFormData({ ...formData, rate_per_gram: e.target.value })
              }
              required
              className="py-2.5 rounded-lg"
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

        <Modal
          isOpen={showPasswordModal}
          title="Manager Password Required"
          onClose={() => {
            setShowPasswordModal(false);
            setPasswordInput('');
            setPasswordError('');
            setPendingUpdateRate(null);
          }}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordInput('');
                  setPasswordError('');
                  setPendingUpdateRate(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handlePasswordSubmit}>Continue</Button>
            </>
          }
        >
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <Input
              label="Password"
              type="password"
              placeholder="Enter password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              required
            />
            {passwordError && (
              <p className="text-sm text-red-600">{passwordError}</p>
            )}
            <p className="text-sm text-slate-600">
              This update requires the manager password.
            </p>
          </form>
        </Modal>
      </div>
    </div>
  );
};
