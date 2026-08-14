# Shared Aurum WhatsApp invoice delivery

## Scope

Aurum owns one Meta WhatsApp Business Account, sender number, access token, webhook configuration, approved Utility template, and Meta billing relationship.
Every participating store sends from that shared Aurum number, and tenant settings contain no Meta credentials or sender bindings.
Merchant-owned WhatsApp senders are a future enhancement and are not part of this implementation.

WhatsApp invoice delivery is available only to hosted Pro organizations while the application feature flag is enabled and the shared template is approved.
Self-hosted installations leave the feature disabled unless the operator intentionally supplies a complete Aurum-level Meta configuration.

## Customer experience and consent

The Utility template must contain no promotional content and should use this wording:

```text
Invoice from {{1}}
Invoice number: {{2}}
Amount: {{3}}
Delivered via Aurum POS
```

The document header contains the exact immutable invoice PDF already stored for the sale.
Checkout and invoice history require staff to confirm that the customer requested WhatsApp delivery and that Aurum POS will send on behalf of the named store.
Checkout still downloads the shop copy after a successful sale whether or not customer WhatsApp delivery was selected.

Customers may receive invoices from multiple Aurum merchants in the same WhatsApp conversation because every store shares the Aurum sender.
The interface discloses this limitation before a history delivery is confirmed.

## Interfaces

- `GET /api/v1/whatsapp/capability` reports the application feature state, Pro availability, sender display name, and current template status.
- `POST /api/v1/sales/{sale_id}/whatsapp-deliveries` requires `Idempotency-Key`, explicit customer-request confirmation, and a writable cashier-or-higher shop context.
- `GET /api/v1/sales/{sale_id}/invoice/content` returns the checksum-verified exact stored PDF for authenticated printing.
- `GET /api/v1/webhooks/whatsapp` performs Meta webhook verification.
- `POST /api/v1/webhooks/whatsapp` verifies `X-Hub-Signature-256` before applying message, template, and suppression events.

The checkout sale body accepts `send_invoice_via_whatsapp` and derives the durable delivery idempotency key from the checkout operation key.
The invoice index exposes the latest tenant-scoped WhatsApp status and consent time without exposing any other shop's records.

## Delivery and privacy model

Each request creates a tenant-scoped delivery audit row and a global worker-control row in the same transaction.
The audit row records organization, shop, sale, recipient, keyed recipient digest, consent actor and time, consent-copy version, source, provider message identifier, status, attempts, and safe error code.
The worker waits until the invoice PDF is ready, reads only the exact PostgreSQL-indexed S3 object, verifies its SHA-256 checksum, uploads it to Meta, and sends the approved template.
Retryable failures use bounded exponential backoff.
An ambiguous message-send timeout becomes `unknown` and is not automatically retried because an automatic retry could duplicate an invoice.
If Meta later posts a signed status callback with the opaque delivery identifier, the webhook reconciles that unknown outcome and stores the provider message identifier.
Webhook status transitions are monotonic for accepted, sent, delivered, and read states.

Incoming STOP, UNSUBSCRIBE, CANCEL, END, or QUIT messages create a global recipient suppression keyed by an application HMAC rather than a plain phone number.
Provider events that explicitly report a block or opt-out also suppress the recipient.
No further worker delivery is sent while suppression is active.
A subsequent explicit customer request creates an audited delivery and re-establishes consent before clearing suppression.
Webhook message bodies are evaluated in memory and are not persisted.

## Application configuration

The operator configures these application-level values:

- `WHATSAPP_ENABLED`
- `WHATSAPP_GRAPH_API_VERSION`
- `WHATSAPP_WABA_ID`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_SENDER_NAME`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_TEMPLATE_NAME`
- `WHATSAPP_TEMPLATE_LANGUAGE`
- `WHATSAPP_TEMPLATE_STATUS`
- `WHATSAPP_RECIPIENT_HMAC_KEY`

Credentials must come from the production secret store and must never be placed in tenant rows, client bundles, logs, or source control.
The webhook callback is `/api/v1/webhooks/whatsapp` on the public API origin.

## Rollout

1. Apply the database migration while `WHATSAPP_ENABLED=false`.
2. Create and approve the shared Aurum Utility invoice template with the exact non-promotional wording.
3. Configure the Aurum WABA, sender, permanent system-user token, app secret, webhook verification token, recipient HMAC key, and template metadata in the application secret store.
4. Subscribe the Meta app to message and template-status webhooks and verify signed callbacks in staging.
5. Run a staging delivery through accepted, sent, delivered, read, failed, opt-out, fresh-consent, and resend-confirmation cases.
6. Enable the feature for production and monitor worker age, terminal failures, unknown outcomes, webhook signature failures, and Meta quality status.
7. Disable `WHATSAPP_ENABLED` immediately if the shared sender, template, quality rating, or billing account becomes unhealthy.

## Assumptions

Meta approves the invoice template as Utility and permits the document header plus the three stated body parameters.
Aurum is the Meta account and billing owner and absorbs provider charges within the Pro product policy.
The customer phone captured on the sale is a WhatsApp-capable E.164 number or a ten-digit Indian number that can be normalized safely.
The originating store remains responsible for obtaining the customer's delivery request and for the accuracy and lawful basis of customer data entered by staff.
The OS print flow may require user confirmation and printer selection even when a printer was previously active.
