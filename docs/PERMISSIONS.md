# Aurum POS Role Permissions

This note documents the role permissions currently enforced by Aurum POS.

The role hierarchy is `Owner > Admin > Manager > Cashier`.

| Permission | Owner | Admin | Manager | Cashier |
|---|:---:|:---:|:---:|:---:|
| View dashboard and analytics | Yes | Yes | Yes | Yes |
| View and search inventory | Yes | Yes | Yes | Yes |
| Scan items and create sales | Yes | Yes | Yes | Yes |
| View, download, and print invoices | Yes | Yes | Yes | Yes |
| Send invoices through WhatsApp | Yes | Yes | Yes | Yes |
| View activity history | Yes | Yes | Yes | Yes |
| Add inventory items and stones | Yes | Yes | Yes | No |
| Edit or delete in-stock items | Yes | Yes | Yes | No |
| Download inventory labels | Yes | Yes | Yes | No |
| Add or update metal rates | Yes | Yes | Yes | No |
| Edit shop and invoice settings | Yes | Yes | No | No |
| View and manage registered devices | Yes | Yes | No | No |
| View staff and pending invitations | Yes | Yes | No | No |
| Invite Managers and Cashiers | Yes | Yes | No | No |
| Change or deactivate Managers and Cashiers | Yes | Yes | No | No |
| Invite or manage Admins | Yes | No | No | No |
| Add another shop | Yes | No | No | No |
| Purchase or restore Aurum Pro | Yes | No | No | No |
| Transfer organization ownership | Yes | No | No | No |

## Restrictions

- Admins cannot invite, modify, or deactivate another Admin.
- An Owner membership cannot be edited or deactivated.
  Ownership must be transferred to another active staff member.
- Inventory items can only be edited or deleted while they are in stock.
- Write operations require the selected shop to have writable subscription access.
  Read-only access blocks changes regardless of role.
- Every role can manage its own account, switch between assigned shops, and change the app theme.

