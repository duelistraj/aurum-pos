import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, FileDown, FileText, Trash2, Upload, Users } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { Alert, Button, Card, Input, ListboxSelect, Modal } from '../components/UI';
import { useShop } from '../context/ShopContext';
import { InvoiceSettings } from './Invoices';
import { downloadBlob } from '../utils';

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

type ManageShopTab = 'invoice-settings' | 'staff' | 'data-management';
const MANAGE_SHOP_TABS: ManageShopTab[] = ['invoice-settings', 'staff', 'data-management'];

interface ImportIssue {
  row: number | null;
  field: string;
  message: string;
}

const DataManagement: React.FC = () => {
  const { activeMembership } = useShop();
  const queryClient = useQueryClient();
  const [exportBusy, setExportBusy] = React.useState(false);
  const [templateBusy, setTemplateBusy] = React.useState(false);
  const [importBusy, setImportBusy] = React.useState(false);
  const [clearBusy, setClearBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [importIssues, setImportIssues] = React.useState<ImportIssue[]>([]);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [duplicateCsv, setDuplicateCsv] = React.useState<string | null>(null);
  const [duplicateFilename, setDuplicateFilename] = React.useState<string | null>(null);
  const [clearOpen, setClearOpen] = React.useState(false);
  const [shopNameConfirmation, setShopNameConfirmation] = React.useState('');

  const clearFeedback = () => {
    setError('');
    setMessage('');
    setImportIssues([]);
  };

  const refreshInventoryData = async (shopId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['shops', shopId, 'items'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.entitlement(shopId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(shopId) }),
      queryClient.invalidateQueries({ queryKey: ['shops', shopId, 'dashboard', 'analytics'] }),
      queryClient.invalidateQueries({ queryKey: ['shops', shopId, 'change-log'] }),
    ]);
  };

  const exportInventory = async () => {
    if (!activeMembership) return;
    setExportBusy(true);
    clearFeedback();
    try {
      const document = await apiClient.exportInventory(activeMembership.shop_id);
      await downloadBlob(
        document,
        `aurum-pos-${activeMembership.shop_slug}-inventory.csv`,
      );
      setMessage('Inventory export downloaded.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to export inventory');
    } finally {
      setExportBusy(false);
    }
  };

  const downloadImportTemplate = async () => {
    if (!activeMembership) return;
    setTemplateBusy(true);
    clearFeedback();
    try {
      const template = await apiClient.downloadInventoryImportTemplate(
        activeMembership.shop_id,
      );
      await downloadBlob(template, 'aurum-pos-inventory-import.csv');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to download import template');
    } finally {
      setTemplateBusy(false);
    }
  };

  const importInventory = async () => {
    if (!activeMembership || !selectedFile) return;
    setImportBusy(true);
    clearFeedback();
    setDuplicateCsv(null);
    setDuplicateFilename(null);
    try {
      const result = await apiClient.importInventory(activeMembership.shop_id, selectedFile);
      const summaries = [`Imported ${result.imported_count} inventory rows.`];
      if (result.duplicate_count > 0) {
        summaries.push(`Skipped ${result.duplicate_count} duplicate barcodes.`);
      }
      if (result.ignored_non_stock_count > 0) {
        summaries.push(`Ignored ${result.ignored_non_stock_count} non-stock export rows.`);
      }
      setMessage(summaries.join(' '));
      setDuplicateCsv(result.duplicate_csv);
      setDuplicateFilename(result.duplicate_filename);
      await refreshInventoryData(activeMembership.shop_id);
    } catch (caught) {
      const detail = (caught as { detail?: { issues?: ImportIssue[] } } | null)?.detail;
      setImportIssues(detail?.issues ?? []);
      setError(caught instanceof Error ? caught.message : 'Unable to import inventory');
    } finally {
      setImportBusy(false);
    }
  };

  const downloadDuplicates = async () => {
    if (!duplicateCsv || !duplicateFilename) return;
    await downloadBlob(
      new Blob([duplicateCsv], { type: 'text/csv;charset=utf-8' }),
      duplicateFilename,
    );
  };

  const clearInventory = async () => {
    if (!activeMembership || shopNameConfirmation !== activeMembership.shop_name) return;
    setClearBusy(true);
    clearFeedback();
    try {
      const result = await apiClient.clearInventory(
        activeMembership.shop_id,
        shopNameConfirmation,
      );
      setClearOpen(false);
      setShopNameConfirmation('');
      setMessage(`Archived ${result.archived_count} in-stock inventory rows.`);
      await refreshInventoryData(activeMembership.shop_id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to clear inventory');
    } finally {
      setClearBusy(false);
    }
  };

  return (
    <div
      id="data-management-panel"
      role="tabpanel"
      aria-labelledby="data-management-tab"
      className="space-y-5"
    >
      {error ? <Alert type="error" message={error} /> : null}
      {message ? <Alert type="success" message={message} /> : null}
      <Card className="p-6">
        <h2 className="text-lg font-bold">Export inventory</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          Download every active inventory row as a CSV snapshot. The export includes item
          identity, pricing inputs, current unit price, native quantity, and stock details.
        </p>
        <p className="mt-3 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          Keep the original column names when filtering this file for another system.
        </p>
        <Button
          type="button"
          className="mt-5"
          isLoading={exportBusy}
          onClick={() => void exportInventory()}
        >
          <Download className="h-4 w-4" />
          Export inventory CSV
        </Button>
      </Card>
      <Card className="p-6">
        <h2 className="text-lg font-bold">Import inventory</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          Import new inventory from a UTF-8 CSV. Existing barcodes are skipped, never
          overwritten, and returned in a correction file.
        </p>
        <p className="mt-3 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          Keep all template columns. Barcode and notes are optional; pricing and stock fields
          are required according to each row's item type and pricing method.
        </p>
        <div className="data-management__button-row mt-5">
          <Button
            type="button"
            variant="secondary"
            isLoading={templateBusy}
            onClick={() => void downloadImportTemplate()}
          >
            <FileDown className="h-4 w-4" />
            Download CSV template
          </Button>
        </div>
        <div className="data-management__file mt-5">
          <span id="inventory-csv-file-label" className="ui-field-label">
            Inventory CSV file
          </span>
          <div className="data-management__file-picker">
            <input
              id="inventory-csv-file"
              type="file"
              accept=".csv,text/csv"
              aria-labelledby="inventory-csv-file-label"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                clearFeedback();
                setDuplicateCsv(null);
                setDuplicateFilename(null);
                if (file && file.size > 5 * 1024 * 1024) {
                  setSelectedFile(null);
                  setError('Inventory CSV must be 5 MiB or smaller.');
                  event.currentTarget.value = '';
                  return;
                }
                setSelectedFile(file);
              }}
            />
            <label
              htmlFor="inventory-csv-file"
              className="data-management__file-picker-control ui-button ui-button--secondary ui-button--md"
            >
              <Upload className="h-4 w-4" />
              Choose CSV
            </label>
            <span
              className={`data-management__file-name ${selectedFile ? 'has-file' : ''}`}
              title={selectedFile?.name}
            >
              {selectedFile?.name ?? 'No file selected.'}
            </span>
          </div>
        </div>
        <Button
          type="button"
          className="mt-5"
          disabled={!selectedFile}
          isLoading={importBusy}
          onClick={() => void importInventory()}
        >
          <Upload className="h-4 w-4" />
          Import inventory CSV
        </Button>
        {importIssues.length > 0 ? (
          <ul className="data-management__issues mt-4" aria-label="CSV import errors">
            {importIssues.map((issue, index) => (
              <li key={`${issue.row}-${issue.field}-${index}`}>
                {issue.row ? `Row ${issue.row}, ` : ''}{issue.field}: {issue.message}
              </li>
            ))}
          </ul>
        ) : null}
        {duplicateCsv && duplicateFilename ? (
          <div className="data-management__duplicates mt-5" role="status">
            <AlertTriangle className="h-5 w-5" />
            <div>
              <p className="font-bold">Duplicate barcodes need attention</p>
              <p className="mt-1 text-sm">
                Download the skipped rows, assign new unique barcodes, and import the file again.
              </p>
              <Button
                type="button"
                variant="secondary"
                className="mt-3"
                onClick={() => void downloadDuplicates()}
              >
                <Download className="h-4 w-4" />
                Download duplicate barcodes CSV
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
      <Card className="data-management__danger p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" />
          <div>
            <h2 className="text-lg font-bold">Clear inventory</h2>
            <p className="mt-2 max-w-2xl text-sm">
              Archive every in-stock item in this shop. Sold items, invoices, and audit history
              remain unchanged. Archived items cannot be restored through Aurum POS.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="danger"
          className="mt-5"
          onClick={() => {
            clearFeedback();
            setShopNameConfirmation('');
            setClearOpen(true);
          }}
        >
          <Trash2 className="h-4 w-4" />
          Clear inventory
        </Button>
      </Card>
      <Modal
        isOpen={clearOpen}
        title="Clear inventory"
        className="data-management__clear-modal"
        onClose={() => {
          if (!clearBusy) setClearOpen(false);
        }}
        footer={(
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={clearBusy}
              onClick={() => setClearOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={shopNameConfirmation !== activeMembership?.shop_name}
              isLoading={clearBusy}
              onClick={() => void clearInventory()}
            >
              Clear inventory
            </Button>
          </>
        )}
      >
        <div className="data-management__clear-warning">
          <AlertTriangle className="h-6 w-6 flex-none" />
          <p>
            This archives all in-stock inventory. Sold items and invoice history are preserved,
            but archived stock cannot be restored through the app.
          </p>
        </div>
        <Input
          id="clear-inventory-shop-name"
          label={`Type ${activeMembership?.shop_name ?? ''} to confirm`}
          autoComplete="off"
          value={shopNameConfirmation}
          onChange={(event) => setShopNameConfirmation(event.target.value)}
        />
      </Modal>
    </div>
  );
};

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
  const allowedRoles = activeMembership?.role === 'OWNER'
    ? OWNER_INVITE_ROLES
    : ADMIN_INVITE_ROLES;
  const allowedRoleOptions = allowedRoles.map((value) => ({ value, label: value }));

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
              <div className="staff-member-actions">
                {member.role === 'OWNER' ? (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
                    OWNER
                  </span>
                ) : (
                  <>
                    <ListboxSelect
                      id={`staff-member-role-${member.id}`}
                      ariaLabel={`Role for ${member.full_name}`}
                      value={member.role}
                      options={allowedRoleOptions}
                      includePlaceholderOption={false}
                      disabled={busy || (activeMembership.role !== 'OWNER' && member.role === 'ADMIN')}
                      onValueChange={(nextRole) => void updateMember(member, {
                        role: nextRole as StaffRole,
                      })}
                      className="staff-member-role"
                    />
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
                        className="staff-make-owner"
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
          <ListboxSelect
            id="staff-invite-role"
            label="Role"
            value={role}
            options={allowedRoleOptions}
            includePlaceholderOption={false}
            disabled={busy || teamEntitlement?.can_invite_member === false}
            onValueChange={(nextRole) => setRole(nextRole as StaffRole)}
          />
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
  const dataManagementTabRef = React.useRef<HTMLButtonElement>(null);
  const requestedTab = searchParams.get('tab');
  const normalizedRequestedTab = requestedTab === 'data-export' ? 'data-management' : requestedTab;
  const activeTab: ManageShopTab = MANAGE_SHOP_TABS.includes(normalizedRequestedTab as ManageShopTab)
    ? normalizedRequestedTab as ManageShopTab
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
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const currentIndex = MANAGE_SHOP_TABS.indexOf(tab);
    const nextTab = MANAGE_SHOP_TABS[
      (currentIndex + direction + MANAGE_SHOP_TABS.length) % MANAGE_SHOP_TABS.length
    ];
    selectTab(nextTab);
    window.requestAnimationFrame(() => {
      const refs = {
        'invoice-settings': invoiceSettingsTabRef,
        staff: staffTabRef,
        'data-management': dataManagementTabRef,
      };
      refs[nextTab].current?.focus();
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
          <button
            ref={dataManagementTabRef}
            id="data-management-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === 'data-management'}
            aria-controls="data-management-panel"
            tabIndex={activeTab === 'data-management' ? 0 : -1}
            className={`app-segmented-control__tab ${activeTab === 'data-management' ? 'is-active' : ''}`}
            onClick={() => selectTab('data-management')}
            onKeyDown={(event) => handleTabKeyDown(event, 'data-management')}
          >
            <Download className="h-4 w-4" />
            Data Management
          </button>
        </div>

        {activeTab === 'invoice-settings' ? (
          <InvoiceSettings shopId={activeMembership.shop_id} />
        ) : activeTab === 'staff' ? (
          <StaffManagement />
        ) : (
          <DataManagement />
        )}
      </div>
    </div>
  );
};
