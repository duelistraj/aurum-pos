import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { apiClient } from '../api/client';
import { Alert, Button, Card, Modal } from '../components/UI';
import { useShop } from '../context/ShopContext';

type StaffRole = 'ADMIN' | 'MANAGER' | 'CASHIER';
type MembershipRole = 'OWNER' | StaffRole;
interface StaffMember {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: MembershipRole;
  is_active: boolean;
}

interface ShopProfile {
  name: string;
  legal_name: string;
  tax_id: string;
  address: string;
  state: string;
  state_code: string;
  invoice_prefix: string;
  tax_rate_percent: string;
}
const OWNER_INVITE_ROLES: StaffRole[] = ['ADMIN', 'MANAGER', 'CASHIER'];
const ADMIN_INVITE_ROLES: StaffRole[] = ['MANAGER', 'CASHIER'];

export const Staff: React.FC = () => {
  const { activeMembership, reload } = useShop();
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<StaffRole>('CASHIER');
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [members, setMembers] = React.useState<StaffMember[]>([]);
  const [ownershipTarget, setOwnershipTarget] = React.useState<StaffMember | null>(null);
  const [profile, setProfile] = React.useState<ShopProfile>({
    name: '',
    legal_name: '',
    tax_id: '',
    address: '',
    state: '',
    state_code: '',
    invoice_prefix: 'INV',
    tax_rate_percent: '3',
  });
  const [roleMenuOpen, setRoleMenuOpen] = React.useState(false);
  const roleDropdownRef = React.useRef<HTMLDivElement>(null);
  const roleTriggerRef = React.useRef<HTMLButtonElement>(null);
  const roleOptionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const allowedRoles = activeMembership?.role === 'OWNER'
    ? OWNER_INVITE_ROLES
    : ADMIN_INVITE_ROLES;

  const loadManagementData = React.useCallback(async () => {
    if (!activeMembership) return;
    const [staffRows, shops] = await Promise.all([
      apiClient.listStaff(activeMembership.shop_id),
      apiClient.listShops(),
    ]);
    setMembers(staffRows);
    const shop = shops.find(({ id }) => id === activeMembership.shop_id);
    if (shop) {
      setProfile({
        name: shop.name,
        legal_name: shop.legal_name ?? shop.name,
        tax_id: shop.tax_id ?? '',
        address: shop.address ?? '',
        state: shop.state ?? '',
        state_code: shop.state_code ?? '',
        invoice_prefix: shop.invoice_prefix ?? 'INV',
        tax_rate_percent: String(shop.tax_rate_percent),
      });
    }
  }, [activeMembership]);

  React.useEffect(() => {
    void loadManagementData().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Unable to load shop settings');
    });
  }, [loadManagementData]);

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

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeMembership) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.updateShop(activeMembership.shop_id, {
        ...profile,
        tax_rate_percent: Number(profile.tax_rate_percent),
      });
      await reload();
      setMessage('Shop and invoice details updated.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update shop');
    } finally {
      setBusy(false);
    }
  };

  const updateMember = async (
    member: StaffMember,
    changes: { role?: StaffRole; is_active?: boolean },
  ) => {
    if (!activeMembership) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.updateStaff(activeMembership.shop_id, member.id, changes);
      await loadManagementData();
      setMessage('Staff access updated.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update staff access');
    } finally {
      setBusy(false);
    }
  };

  const transferOwnership = async () => {
    if (!activeMembership || !ownershipTarget) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.transferShopOwnership(
        activeMembership.shop_id,
        ownershipTarget.id,
      );
      setOwnershipTarget(null);
      await reload();
      await loadManagementData();
      setMessage(`Ownership transferred to ${ownershipTarget.full_name}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to transfer ownership');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-page app-page__container mx-auto max-w-3xl space-y-5 p-6 text-slate-900 dark:text-slate-100">
      <div className="app-page__header app-page__header--stacked">
        <h1>Shop and staff</h1>
        <p>
          Configure invoice identity and control who can access this shop.
        </p>
      </div>
      {error ? <Alert type="error" message={error} /> : null}
      {message ? <Alert type="success" message={message} /> : null}
      <Card className="p-6">
        <h2 className="mb-1 text-lg font-bold">Invoice identity</h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          These values are snapshotted onto each sale so issued invoices never change later.
        </p>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void saveProfile(event)}>
          {([
            ['name', 'Shop display name'],
            ['legal_name', 'Legal business name'],
            ['tax_id', 'Tax ID / GSTIN'],
            ['invoice_prefix', 'Invoice prefix'],
            ['tax_rate_percent', 'GST rate (%)'],
            ['state', 'State'],
            ['state_code', 'State code'],
          ] as const).map(([field, label]) => (
            <label key={field} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {label}
              <input
                required={!['tax_id'].includes(field)}
                value={profile[field]}
                onChange={(event) => setProfile((current) => ({
                  ...current,
                  [field]: event.target.value,
                }))}
                className="mt-1 w-full rounded-app-control border border-slate-300 bg-white p-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
          ))}
          <label className="block text-sm font-medium text-slate-700 sm:col-span-2 dark:text-slate-300">
            Business address
            <textarea
              required
              value={profile.address}
              onChange={(event) => setProfile((current) => ({
                ...current,
                address: event.target.value,
              }))}
              className="mt-1 w-full rounded-app-control border border-slate-300 bg-white p-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>Save invoice details</Button>
          </div>
        </form>
      </Card>
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-bold">Current staff</h2>
        <div className="space-y-3">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex flex-col gap-3 rounded-app-control border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800"
            >
              <div>
                <p className="font-semibold">{member.full_name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{member.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {member.role === 'OWNER' ? (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
                    OWNER
                  </span>
                ) : (
                  <>
                    <select
                      aria-label={`Role for ${member.full_name}`}
                      value={member.role}
                      disabled={busy || (activeMembership.role !== 'OWNER' && member.role === 'ADMIN')}
                      onChange={(event) => void updateMember(member, {
                        role: event.target.value as StaffRole,
                      })}
                      className="rounded-app-control border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    >
                      {(activeMembership.role === 'OWNER'
                        ? OWNER_INVITE_ROLES
                        : ADMIN_INVITE_ROLES).map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant={member.is_active ? 'secondary' : 'primary'}
                      disabled={busy}
                      onClick={() => void updateMember(member, {
                        is_active: !member.is_active,
                      })}
                    >
                      {member.is_active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                    {activeMembership.role === 'OWNER' && member.is_active ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setOwnershipTarget(member)}
                      >
                        Make owner
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-6">
        <h2 className="mb-1 text-lg font-bold">Invite staff</h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Invitation codes expire after seven days.
        </p>
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
      <Modal
        isOpen={ownershipTarget !== null}
        title="Transfer shop ownership"
        onClose={() => setOwnershipTarget(null)}
        footer={(
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setOwnershipTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={busy}
              onClick={() => void transferOwnership()}
            >
              Transfer ownership
            </Button>
          </>
        )}
      >
        <p>
          {ownershipTarget
            ? `${ownershipTarget.full_name} will become the owner. Your role will change to administrator.`
            : ''}
        </p>
      </Modal>
    </div>
  );
};
