import React, { useEffect, useState } from 'react';
import { Server, X } from 'lucide-react';
import { getApiBaseUrl, saveApiBaseUrl, validateApiBaseUrl } from '../utils/apiConfig';
import { useConfig } from '../context/ConfigContext';
import { Alert, Button, Input } from '../components/UI';
import { BrandLockup } from '../components/Brand';

interface ApiSetupProps {
  onConfigured: () => void;
  onCancel?: () => void;
}

export const ApiSetup: React.FC<ApiSetupProps> = ({ onConfigured, onCancel }) => {
  const { appName } = useConfig();
  const [apiUrl, setApiUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void getApiBaseUrl()
      .then((url) => {
        if (active) setApiUrl(url);
      })
      .catch(() => {
        // An empty value is a valid first-run state for self-hosted builds.
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      await validateApiBaseUrl(apiUrl);
      await saveApiBaseUrl(apiUrl);
      onConfigured();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not connect to the backend API.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`api-setup${onCancel ? ' api-setup--overlay' : ''}`}>
      <main className="api-setup__panel" aria-labelledby="api-setup-title">
        <header className="api-setup__header">
          <div className="api-setup__brand">
            <BrandLockup appName={appName || 'Aurum POS'} isPro={false} />
            <span className="api-setup__brand-label">Backend connection</span>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="api-setup__close"
              aria-label="Close API setup"
            >
              <X className="api-setup__close-icon" />
            </button>
          )}
        </header>

        <div className="api-setup__intro">
          <p className="api-setup__eyebrow">Workspace setup</p>
          <h1 id="api-setup-title" className="api-setup__title">Connect your backend</h1>
          <p className="api-setup__description">
            Connect this Aurum POS client to the API that stores your shop, inventory, sales, and settings.
          </p>
        </div>

        <div className="api-setup__status" role="status">
          <Server className="api-setup__status-icon" aria-hidden="true" />
          <span className="api-setup__status-dot" aria-hidden="true" />
          <span>Ready to verify your backend connection</span>
        </div>

        <form className="api-setup__form" onSubmit={handleSubmit}>
          {error && <Alert type="error" title="Connection failed" message={error} />}

          <Input
            id="api-url"
            name="api-url"
            type="url"
            label="Backend API URL"
            required
            placeholder="https://pos.example.com"
            value={apiUrl}
            onChange={(event) => setApiUrl(event.target.value)}
          />
          <p className="api-setup__hint">
            Use the complete server address, including <code>http://</code> or <code>https://</code>.
          </p>

          <div className="api-setup__actions">
            {onCancel && (
              <Button type="button" variant="secondary" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" isLoading={loading}>
              Save and continue
            </Button>
          </div>
        </form>

        <p className="api-setup__footer">
          The URL is stored locally on this device and can be changed later from Account and settings.
        </p>
      </main>
    </div>
  );
};
