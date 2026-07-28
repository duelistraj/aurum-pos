# Aurum Cloud lean operations

The validation deployment is one ARM64 `t4g.medium` instance plus Aiven PostgreSQL.
The instance has an Elastic IP, exposes only ports 80/443, and is administered
through SSM. `api.aurumpos.net` points to the Elastic IP. Host Nginx proxies to
the loopback-only API port, and Certbot manages TLS.

## Required preparation

- Attach a least-privilege instance role for SSM, CloudWatch, SES, and object-scoped `s3:GetObject`, `s3:PutObject`, and `s3:DeleteObject` access to `arn:aws:s3:::aurum-pos-prod-duelistraj/shops/*`.
- Install Nginx, Certbot with its Nginx plugin, Docker Compose, AWS CLI, and Git.
- Allowlist the Elastic IP in Aiven and use a TLS pool URL for the application.
- Retrieve the restricted runtime configuration from an encrypted AWS parameter and install it as `.env` on the host with mode `0600`; never commit the file.
- Store the migration administrator URL separately and inject it as `MIGRATION_DATABASE_URL` only into the one-shot migration container.
- The runtime role must be `NOSUPERUSER NOBYPASSRLS` and must not own application tables.
- The migration and runtime principals must never be the same role.
- Configure SES DKIM/SPF/DMARC for `aurumpos.net`, Google service credentials,
  Pub/Sub authenticated push (including the exact OIDC service-account email),
  and `api.aurumpos.net` DNS before deployment.
- Set `EMAIL_FROM` to the verified SES mailbox or display-name form used for verification, password-reset, invitation, and deletion email.
- Set `GOOGLE_WEB_CLIENT_ID` to the Web OAuth client ID used both for server-side token verification and public Android provider discovery.
- Keep `aurum-pos-prod-duelistraj` private in `ap-southeast-1` with Block Public Access enabled.
- Set `AWS_REGION=ap-southeast-1`, `S3_INVOICE_BUCKET=aurum-pos-prod-duelistraj`, `S3_INVOICE_PREFIX=shops`, and `S3_PRESIGNED_URL_EXPIRY_SECONDS=600` in the runtime environment.
- Tune `DATABASE_POOL_SIZE` and `DATABASE_MAX_OVERFLOW` so the API and worker containers together remain below the Aiven connection limit.
- Keep `DATABASE_STATEMENT_TIMEOUT_MS=30000` unless a measured endpoint requires a narrower limit.
- Keep the bounded worker defaults unless monitoring shows a need to change `WORKER_EMAIL_CONCURRENCY`, `WORKER_RECONCILIATION_BATCH_SIZE`, or `WORKER_RECONCILIATION_CONCURRENCY`.
- Grant the instance role permission to create and write only the `/aurum-pos/api` and `/aurum-pos/worker` CloudWatch log groups.
- Enable S3 versioning and a recovery lifecycle for invoice objects while API and worker share one instance identity.

The boto3 credential chain automatically obtains temporary credentials from the EC2 instance role.
Never add `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` to the production runtime file.
Local operators may use `aws configure`, `AWS_PROFILE`, or temporary credentials exported in their shell.

PostgreSQL is the authoritative invoice index, and the API reads exact object keys from authorized sale rows.
The application never lists the bucket.
`s3:DeleteObject` is required only so the account-deletion worker can remove exact invoice keys read from PostgreSQL before permanently deleting a shop.
`s3:ListBucket` remains intentionally unnecessary.
The IAM policy should scope all three object actions to `arn:aws:s3:::aurum-pos-prod-duelistraj/shops/*` and should not grant bucket-wide listing.

Nginx provides a coarse per-IP limit for sensitive authentication routes.
The application adds durable per-IP and per-account fixed-window limits in PostgreSQL.
Compose assigns a fixed `172.30.0.1` gateway to the host proxy path and configures Uvicorn to trust only that address.
Nginx overwrites `X-Forwarded-For` with the direct client address instead of accepting a caller-provided chain.

## Deployment

Set `AURUM_IMAGE`, `AURUM_GIT_SHA`, `AURUM_CONFIG_REVISION`, `MIGRATION_DATABASE_URL`, and `AURUM_PUBLIC_API_URL`, then run `deploy/deploy.sh` through SSM.
The script refuses mutable tags, validates the restricted runtime role, acquires a deployment lock, pauses the worker, runs migration with the operator-only credential, verifies the API revision, starts a uniquely identified worker, and verifies its new heartbeat.
Failure traps restore the prior application image and restart the previous worker.
Nginx remains a host service and proxies to `127.0.0.1:8000`.

Keep the prior image digest for application rollback. Database migrations must
remain backward-compatible after the initial clean-database SaaS cutover. The
legacy BMR rollback is its isolated old deployment, not an application rollback
against the new schema.

The worker uses expiring PostgreSQL leases with unique fencing tokens for email, invoice generation, subscription reconciliation, and account deletion work.
Independent worker queues execute concurrently inside the lean worker process so slow deletion or provider calls do not stall invoice and email progress.
Invoice PDFs are generated off the async event loop, retried with a stable object key, and exposed only after successful S3 upload metadata commits.
Invoice delivery stops automatic retries after `WORKER_INVOICE_MAX_ATTEMPTS`; an authenticated download request requeues a failed job.
Email delivery stops retrying after `WORKER_EMAIL_MAX_ATTEMPTS` and leaves the row in `failed` state for operator review.
Account deletion cancels active Play renewals and removes exact S3 invoice objects before deleting a sole-owned shop.
Once external deletion cleanup starts, cancellation is permanently disabled and failures remain retryable or require explicit operator intervention.

The old EC2/database deployment remains an isolated rollback environment. The
SaaS cutover deploys `compose.cloud.yml` with a digest-pinned API and worker; it
must not run the destructive non-item reset against the live BMR database.

## Backup and restore

Database backup, retention, and restoration are configured and operated
directly through the selected infrastructure providers. Aurum POS does not run
application-managed backup jobs.

For the initial launch, require a provider recovery point objective of at most 24 hours and a recovery time objective of at most four hours.
Before sustained traffic reaches 10,000 active users, tighten those objectives to at most one hour of data loss and at most two hours to restore service.
Record the configured point-in-time recovery window, backup retention, backup region, and responsible operator in the private operations repository.

Run a restore drill before launch and at least quarterly:

1. Restore the latest backup or point-in-time snapshot into an isolated database project.
2. Connect using a temporary migration administrator credential and run `alembic current` plus `alembic check`.
3. Start the tested application digest against the restored database and verify login, shop selection, inventory counts, recent sales, invoice metadata, and worker heartbeat.
4. Compare row counts for users, shops, memberships, items, sales, sale items, invoice jobs, and subscriptions against the source checkpoint.
5. Record achieved recovery point and recovery time, investigate every mismatch, then destroy the isolated restore and its temporary credentials.

## Scale triggers

Start Terraform and an ALB/multi-instance design before adding a second host or when sustained CPU exceeds 60%, memory exceeds 70%, API p95 exceeds 500 ms, or single-host availability is no longer acceptable.
The API is stateless; session, durable jobs, outbox, entitlement, and worker-lease state live in PostgreSQL.
Before raising API worker counts, keep the sum of every process's `DATABASE_POOL_SIZE + DATABASE_MAX_OVERFLOW` below the Aiven connection limit with room for migrations and operations.
Run the repository k6 scenario at 100 concurrent users before launch and after every material query or topology change.
Before a 10,000-user test, deploy at least two API instances, run workers independently from API capacity, place a connection pooler in front of PostgreSQL if the measured connection budget requires it, and alert on p95 latency, error rate, database saturation, and oldest pending job age.

## Required alarms

- Alert when API 5xx responses exceed 1% for five minutes or p95 latency exceeds 500 ms for ten minutes.
- Alert when the worker heartbeat is stale, reports the wrong revision, or any durable queue's oldest pending record exceeds five minutes.
- Alert on database connection saturation, statement timeouts, storage growth, failed backups, and replication or provider health warnings.
- Alert on terminal email or invoice jobs, repeated billing acknowledgement failures, and account deletions requiring operator intervention.
- Alert on certificate expiry within 21 days and any public HTTP response that is not a redirect to HTTPS.
- Alert on unusual SES volume and S3 delete volume while the lean topology shares one EC2 identity.
