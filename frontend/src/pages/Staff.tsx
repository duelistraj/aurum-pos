import React from 'react';
import { Check, ChevronDown, FileText, Users } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { Alert, Button, Card, Modal } from '../components/UI';
import { useShop } from '../context/ShopContext';
import { InvoiceSettings } from './Invoices';

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

interface PendingInvitation {
  id: string;
  email: string;
  role: StaffRole;
  expires_at: string;
}

interface TeamEntitlement {
  plan: 'free' | 'pro';
  team_seat_limit: number | null;
  team_seat_usage: number;
  can_invite_member: boolean;
}

const OWNER_INVITE_ROLES: StaffRole[] = ['ADMIN', 'MANAGER', 'CASHIER'];
const ADMIN_INVITE_ROLES: StaffRole[] = ['MANAGER', 'CASHIER'];

type ManageShopTab = 'invoice-settings' | 'staff';

const StaffManagement: React.FC = () => {
  const { activeMembership } = useShop();
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<StaffRole>('CASHIER');
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [members, setMembers] = React.useState<StaffMember[]>([]);
  const [pendingInvitations, setPendingInvitations] =
    React.useState<PendingInvitation[]>([]);
  const [teamEntitlement, setTeamEntitlement] =
    React.useState<TeamEntitlement | null>(null);
  const [ownershipTarget, setOwnershipTarget] = React.useState<StaffMember | null>(null);
  const [roleMenuOpen, setRoleMenuOpen] = React.useState(false);
  const roleDropdownRef = React.useRef<HTMLDivElement>(null);
  const roleTriggerRef = React.useRef<HTMLButtonElement>(null);
  const roleOptionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const allowedRoles = activeMembership?.role === 'OWNER'
    ? OWNER_INVITE_ROLES
    : ADMIN_INVITE_ROLES;

  const loadManagementData = React.useCallback(async () => {
    if (!activeMembership) return;
    const [staffRows, invitationRows, entitlement] = await Promise.all([
      apiClient.listStaff(activeMembership.shop_id),
      apiClient.listPendingInvitations(activeMembership.shop_id),
      apiClient.getEntitlement(),
    ]);
    setMembers(staffRows);
    setPendingInvitations(invitationRows);
    setTeamEntitlement(entitlement);
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
      await loadManagementData();
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

  const revokeInvitation = async (invitation: PendingInvitation) => {
    if (!activeMembership) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiClient.revokeInvitation(activeMembership.shop_id, invitation.id);
      await loadManagementData();
      setMessage(`Invitation for ${invitation.email} revoked.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to revoke invitation');
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
      await apiClient.transferOrganizationOwnership(
        activeMembership.organization_id,
        ownershipTarget.id,
      );
      setOwnershipTarget(null);
      setMessage(
        `Ownership transfer to ${ownershipTarget.full_name} is pending billing handoff.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to transfer ownership');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      id="staff-management-panel"
      role="tabpanel"
      aria-labelledby="staff-management-tab"
      className="space-y-5"
    >
      {error ? <Alert type="error" message={error} /> : null}
      {message ? <Alert type="success" message={message} /> : null}
      {teamEntitlement ? (
        <Card className="p-5">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            Organization seats
          </p>
          <p className="mt-1 text-xl font-bold">
            {teamEntitlement.team_seat_usage}
            {teamEntitlement.team_seat_limit === null
              ? ' active'
              : ` of ${teamEntitlement.team_seat_limit} used`}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            A person counts once across all shops. Pending invitations reserve a seat.
          </p>
        </Card>
      ) : null}
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
      {pendingInvitations.length > 0 ? (
        <Card className="p-6">
          <h2 className="mb-1 text-lg font-bold">Pending invitations</h2>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Revoke an unused invitation to release its reserved seat.
          </p>
          <div className="space-y-3">
            {pendingInvitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex flex-col gap-3 rounded-app-control border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800"
              >
                <div>
                  <p className="font-semibold">{invitation.email}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {invitation.role} - expires{' '}
                    {new Date(invitation.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void revokeInvitation(invitation)}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
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
              disabled={busy || teamEntitlement?.can_invite_member === false}
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
              disabled={busy || teamEntitlement?.can_invite_member === false}
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
          {teamEntitlement?.can_invite_member === false ? (
            <Alert
              type="warning"
              message={
                teamEntitlement.plan === 'free'
                  ? 'The Free plan seat limit is reached. Upgrade to invite another person.'
                  : 'The Pro seat limit is reached. Revoke an invitation or deactivate a member first.'
              }
            />
          ) : null}
          <Button
            type="submit"
            disabled={busy || teamEntitlement?.can_invite_member === false}
          >
            {busy ? 'Sending…' : 'Send invitation'}
          </Button>
        </form>
      </Card>
      <Modal
        isOpen={ownershipTarget !== null}
        title="Transfer organization ownership"
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
              Begin transfer
            </Button>
          </>
        )}
      >
        <p>
          {ownershipTarget
            ? `${ownershipTarget.full_name} will become the owner of every shop. Google Play renewal will be cancelled first, and your Pro access will continue until the paid period expires.`
            : ''}
        </p>
      </Modal>
    </div>
  );
};

export const ManageShop: React.FC = () => {
  const { activeMembership, canManage } = useShop();
  const [searchParams, setSearchParams] = useSearchParams();
  const invoiceSettingsTabRef = React.useRef<HTMLButtonElement>(null);
  const staffTabRef = React.useRef<HTMLButtonElement>(null);
  const activeTab: ManageShopTab = searchParams.get('tab') === 'staff'
    ? 'staff'
    : 'invoice-settings';

  if (
    !activeMembership
    || !canManage
    || !['OWNER', 'ADMIN'].includes(activeMembership.role)
  ) {
    return (
      <div className="app-page__container mx-auto max-w-3xl p-6">
        <Alert
          type="error"
          message={
            activeMembership?.access_mode === 'read_only'
              ? 'Restore Pro to manage this additional shop.'
              : 'Only shop owners and administrators can manage shop settings.'
          }
        />
      </div>
    );
  }

  const selectTab = (tab: ManageShopTab) => {
    const nextParams = new URLSearchParams(searchParams);
    if (tab === 'invoice-settings') nextParams.delete('tab');
    else nextParams.set('tab', tab);
    setSearchParams(nextParams);
  };

  const handleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    tab: ManageShopTab,
  ) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const nextTab = tab === 'invoice-settings' ? 'staff' : 'invoice-settings';
    selectTab(nextTab);
    window.requestAnimationFrame(() => {
      (nextTab === 'invoice-settings' ? invoiceSettingsTabRef : staffTabRef).current?.focus();
    });
  };

  return (
    <div className="app-page min-h-screen bg-transparent text-slate-900 dark:text-slate-100">
      <div className="app-page__container mx-auto max-w-4xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
        <div className="app-page__header app-page__header--stacked">
          <h1>Manage Shop</h1>
          <p>Configure invoice details and control who can access this shop.</p>
        </div>

        <div
          className="app-segmented-control"
          role="tablist"
          aria-label="Manage shop sections"
        >
          <button
            ref={invoiceSettingsTabRef}
            id="invoice-settings-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === 'invoice-settings'}
            aria-controls="invoice-settings-panel"
            tabIndex={activeTab === 'invoice-settings' ? 0 : -1}
            className={`app-segmented-control__tab ${activeTab === 'invoice-settings' ? 'is-active' : ''}`}
            onClick={() => selectTab('invoice-settings')}
            onKeyDown={(event) => handleTabKeyDown(event, 'invoice-settings')}
          >
            <FileText className="h-4 w-4" />
            Invoice Settings
          </button>
          <button
            ref={staffTabRef}
            id="staff-management-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === 'staff'}
            aria-controls="staff-management-panel"
            tabIndex={activeTab === 'staff' ? 0 : -1}
            className={`app-segmented-control__tab ${activeTab === 'staff' ? 'is-active' : ''}`}
            onClick={() => selectTab('staff')}
            onKeyDown={(event) => handleTabKeyDown(event, 'staff')}
          >
            <Users className="h-4 w-4" />
            Staff
          </button>
        </div>

        {activeTab === 'invoice-settings' ? (
          <InvoiceSettings shopId={activeMembership.shop_id} />
        ) : (
          <StaffManagement />
        )}
      </div>
    </div>
  );
};
