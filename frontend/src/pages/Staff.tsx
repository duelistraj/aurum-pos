import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
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
  const [roleMenuOpen, setRoleMenuOpen] = React.useState(false);
  const roleDropdownRef = React.useRef<HTMLDivElement>(null);
  const roleTriggerRef = React.useRef<HTMLButtonElement>(null);
  const roleOptionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const allowedRoles = activeMembership?.role === 'OWNER'
    ? OWNER_INVITE_ROLES
    : ADMIN_INVITE_ROLES;

  React.useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!roleDropdownRef.current?.contains(event.target as Node)) setRoleMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !roleMenuOpen) return;
      setRoleMenuOpen(false);
      roleTriggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [roleMenuOpen]);

  const focusRoleOption = (index: number) => {
    const wrappedIndex = (index + allowedRoles.length) % allowedRoles.length;
    roleOptionRefs.current[wrappedIndex]?.focus();
  };

  const openRoleMenu = (focusIndex?: number) => {
    setRoleMenuOpen(true);
    if (focusIndex !== undefined) {
      window.requestAnimationFrame(() => focusRoleOption(focusIndex));
    }
  };

  const handleRoleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    openRoleMenu(event.key === 'ArrowDown' ? 0 : allowedRoles.length - 1);
  };

  const handleRoleOptionKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusRoleOption(index + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      focusRoleOption(event.key === 'Home' ? 0 : allowedRoles.length - 1);
    }
  };

  const chooseRole = (selectedRole: StaffRole) => {
    setRole(selectedRole);
    setRoleMenuOpen(false);
    roleTriggerRef.current?.focus();
  };

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
    <div className="mx-auto max-w-xl space-y-5 p-6 text-slate-900 dark:text-slate-100">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Staff invitations</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Staff accounts can join this shop only with an invitation. Codes expire after seven days.
      </p>
      {error ? <Alert type="error" message={error} /> : null}
      {message ? <Alert type="success" message={message} /> : null}
      <Card className="p-6">
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-app-control border border-slate-300 bg-white p-3 text-slate-900 placeholder-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500"
            />
          </label>
          <div ref={roleDropdownRef} className="relative">
            <span
              id="staff-role-label"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Role
            </span>
            <button
              ref={roleTriggerRef}
              type="button"
              aria-labelledby="staff-role-label staff-role-value"
              aria-haspopup="listbox"
              aria-expanded={roleMenuOpen}
              onClick={() => setRoleMenuOpen((current) => !current)}
              onKeyDown={handleRoleTriggerKeyDown}
              className={`mt-1 flex w-full items-center justify-between gap-3 rounded-app-control border bg-white p-3 text-left text-slate-900 transition-all dark:bg-slate-950 dark:text-slate-100 ${
                roleMenuOpen
                  ? 'border-amber-500 ring-2 ring-amber-500/25'
                  : 'border-slate-300 hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-600'
              }`}
            >
              <span id="staff-role-value" className="font-medium">{role}</span>
              <ChevronDown
                className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${roleMenuOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {roleMenuOpen ? (
              <div
                role="listbox"
                aria-labelledby="staff-role-label"
                className="absolute left-0 right-0 top-full z-30 mt-2 space-y-1 rounded-app-surface border border-slate-200 bg-white p-2 shadow-xl animate-fade-in dark:border-slate-800 dark:bg-slate-900"
              >
                {allowedRoles.map((value, index) => {
                  const selected = value === role;
                  return (
                    <button
                      key={value}
                      ref={(node) => { roleOptionRefs.current[index] = node; }}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => chooseRole(value)}
                      onKeyDown={(event) => handleRoleOptionKeyDown(event, index)}
                      className={`flex w-full items-center justify-between gap-3 rounded-app-control px-3 py-2.5 text-left text-sm transition-colors ${
                        selected
                          ? 'bg-amber-50 font-bold text-slate-900 dark:bg-amber-500/10 dark:text-white'
                          : 'font-semibold text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{value}</span>
                      {selected ? <Check className="h-4 w-4 flex-shrink-0 text-amber-500" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send invitation'}</Button>
        </form>
      </Card>
    </div>
  );
};
