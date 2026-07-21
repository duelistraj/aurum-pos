import React from 'react';
import { apiClient } from '../api/client';
import { Alert, Button, Card } from '../components/UI';
import { useShop } from '../context/ShopContext';

type StaffRole = 'ADMIN' | 'MANAGER' | 'CASHIER';
const OWNER_INVITE_ROLES: StaffRole[] = ['ADMIN', 'MANAGER', 'CASHIER'];
const ADMIN_INVITE_ROLES: StaffRole[] = ['MANAGER', 'CASHIER'];

export const Staff: React.FC = () => {
  const { activeMembership } = useShop();
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<StaffRole>('CASHIER');
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const allowedRoles = activeMembership?.role === 'OWNER'
    ? OWNER_INVITE_ROLES
    : ADMIN_INVITE_ROLES;

  if (!activeMembership || !['OWNER', 'ADMIN'].includes(activeMembership.role)) {
    return <Alert type="error" message="Your role cannot invite staff." />;
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const invitation = await apiClient.inviteStaff(activeMembership.shop_id, { email, role });
      setEmail('');
      setMessage(
        invitation.token
          ? `Invitation created. Local code: ${invitation.token}`
          : `Invitation emailed to ${invitation.email}.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to invite staff');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-5 p-6">
      <h1 className="text-3xl font-bold">Staff invitations</h1>
      <p className="text-sm text-slate-600">
        Staff accounts can join this shop only with an invitation. Codes expire after seven days.
      </p>
      {error ? <Alert type="error" message={error} /> : null}
      {message ? <Alert type="success" message={message} /> : null}
      <Card>
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <label className="block text-sm font-medium">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 p-3"
            />
          </label>
          <label className="block text-sm font-medium">
            Role
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as StaffRole)}
              className="mt-1 w-full rounded-xl border border-slate-300 p-3"
            >
              {allowedRoles.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send invitation'}</Button>
        </form>
      </Card>
    </div>
  );
};
