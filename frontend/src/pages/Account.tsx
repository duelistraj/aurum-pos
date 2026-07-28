import React from 'react';
import { Alert, Button, Card } from '../components/UI';
import { apiClient } from '../api/client';
import { useShop } from '../context/ShopContext';

export const Account: React.FC = () => {
  const { user } = useShop();
  const [deleteOwnedShops, setDeleteOwnedShops] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const requestDeletion = async () => {
    if (
      !user
      || !window.confirm('Email a confirmation link to schedule account deletion?')
    ) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await apiClient.requestAccountDeletion(user.email, deleteOwnedShops);
      setMessage(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Deletion request failed');
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <div className="app-page__container mx-auto max-w-2xl p-6">
        <Alert type="error" message="Account details are unavailable." />
      </div>
    );
  }

  return (
    <div className="app-page app-page__container mx-auto max-w-2xl space-y-5 p-6 text-slate-900 dark:text-slate-100">
      <div className="app-page__header app-page__header--stacked">
        <h1>Account</h1>
        <p>Review your personal account and deletion options.</p>
      </div>
      {error ? <Alert type="error" message={error} /> : null}
      {message ? <Alert type="success" message={message} /> : null}
      <Card className="p-6">
        <h2 className="text-lg font-semibold">{user.full_name}</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{user.email}</p>
      </Card>
      <Card className="border-red-200 p-6 dark:border-red-900">
        <h2 className="text-lg font-semibold text-red-700 dark:text-red-300">
          Account deletion
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          We will email a confirmation link.
          After confirmation, deletion is scheduled for seven days later.
        </p>
        <label className="my-4 flex gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={deleteOwnedShops}
            onChange={(event) => setDeleteOwnedShops(event.target.checked)}
            className="checkbox-round"
          />
          Delete shops for which I am the sole owner
        </label>
        <Button variant="danger" onClick={() => void requestDeletion()} disabled={busy}>
          {busy ? 'Requesting…' : 'Request account deletion'}
        </Button>
      </Card>
    </div>
  );
};
