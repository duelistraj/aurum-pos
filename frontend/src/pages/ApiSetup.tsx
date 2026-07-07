import React, { useEffect, useState } from 'react';
import { AlertCircle, Server, X } from 'lucide-react';
import { getApiBaseUrl, saveApiBaseUrl, validateApiBaseUrl } from '../utils/apiConfig';

interface ApiSetupProps {
  onConfigured: () => void;
  onCancel?: () => void;
}

export const ApiSetup: React.FC<ApiSetupProps> = ({ onConfigured, onCancel }) => {
  const [apiUrl, setApiUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getApiBaseUrl().then(setApiUrl);
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      await validateApiBaseUrl(apiUrl);
      await saveApiBaseUrl(apiUrl);
      onConfigured();
    } catch (err: any) {
      setError(err.message || 'Could not connect to the backend API.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 p-8 rounded-lg shadow-xl border border-slate-100 dark:border-slate-800">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="h-12 w-12 bg-amber-100 dark:bg-amber-500/10 rounded-full flex items-center justify-center">
              <Server className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="mt-6 text-2xl font-bold text-slate-900 dark:text-white">
              Connect backend
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Enter the API URL for your shop's Aurum POS backend.
            </p>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="h-9 w-9 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close API setup"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/40 p-4 flex items-start">
              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
              <div className="text-sm text-red-700 dark:text-red-200">{error}</div>
            </div>
          )}

          <div>
            <label htmlFor="api-url" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Backend API URL
            </label>
            <input
              id="api-url"
              name="api-url"
              type="url"
              required
              className="mt-2 block w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-3 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="https://pos.example.com"
              value={apiUrl}
              onChange={(event) => setApiUrl(event.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-3 px-4 rounded-md text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-70 transition-colors"
          >
            {loading ? 'Checking...' : 'Save and continue'}
          </button>
        </form>
      </div>
    </div>
  );
};
