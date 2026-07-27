# Aurum Cloud lean operations

The validation deployment is one ARM64 `t4g.medium` instance plus Aiven PostgreSQL.
The instance has an Elastic IP, exposes only ports 80/443, and is administered
through SSM. `api.aurumpos.net` points to the Elastic IP. Host Nginx proxies to
the loopback-only API port, and Certbot manages TLS.

## Required preparation

- Attach a least-privilege instance role for SSM, CloudWatch, SES, and object-scoped `s3:GetObject`, `s3:PutObject`, and `s3:DeleteObject` access to `arn:aws:s3:::aurum-pos-prod-duelistraj/shops/*`.
- Install Nginx, Certbot with its Nginx plugin, Docker Compose, AWS CLI, and Git.
- Allowlist the Elastic IP in Aiven and use a TLS pool URL for the application.
- Retrieve the runtime configuration from an encrypted AWS parameter and
  install it as `.env` on the host with mode `0600`; never commit the file.
  Compose loads that file into the API and worker containers.
- Configure SES DKIM/SPF/DMARC for `aurumpos.net`, Google service credentials,
  Pub/Sub authenticated push (including the exact OIDC service-account email),
  and `api.aurumpos.net` DNS before deployment.
- Set `EMAIL_FROM` to the verified SES mailbox or display-name form used for verification, password-reset, invitation, and deletion email.
- Set `GOOGLE_WEB_CLIENT_ID` to the Web OAuth client ID used both for server-side token verification and public Android provider discovery.
- Keep `aurum-pos-prod-duelistraj` private in `ap-southeast-1` with Block Public Access enabled.
- Set `AWS_REGION=ap-southeast-1`, `S3_INVOICE_BUCKET=aurum-pos-prod-duelistraj`, `S3_INVOICE_PREFIX=shops`, and `S3_PRESIGNED_URL_EXPIRY_SECONDS=600` in the runtime environment.
- Tune `DATABASE_POOL_SIZE` and `DATABASE_MAX_OVERFLOW` so the API and worker containers together remain below the Aiven connection limit.
- Keep the bounded worker defaults unless monitoring shows a need to change `WORKER_EMAIL_CONCURRENCY`, `WORKER_RECONCILIATION_BATCH_SIZE`, or `WORKER_RECONCILIATION_CONCURRENCY`.

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
Keep Uvicorn's trusted forwarded-proxy range restricted to the loopback Nginx proxy.

## Deployment

Set `AURUM_IMAGE` to the tested GHCR digest, then run `deploy/deploy.sh` through
SSM. The script refuses mutable tags, runs the migration from the same image,
starts the API and worker, and checks readiness. Nginx remains a host service
and proxies to `127.0.0.1:8000`.

Keep the prior image digest for application rollback. Database migrations must
remain backward-compatible after the initial clean-database SaaS cutover. The
legacy BMR rollback is its isolated old deployment, not an application rollback
against the new schema.

The worker uses expiring PostgreSQL leases for email, invoice generation, subscription reconciliation, and account deletion work.
Invoice PDFs are generated off the async event loop, retried with a stable object key, and exposed only after successful S3 upload metadata commits.
Invoice delivery stops automatic retries after `WORKER_INVOICE_MAX_ATTEMPTS`; an authenticated download request requeues a failed job.
Email delivery stops retrying after `WORKER_EMAIL_MAX_ATTEMPTS` and leaves the row in `failed` state for operator review.
Account deletion cancels active Play renewals and removes exact S3 invoice objects before deleting a sole-owned shop.
Do not manually delete a scheduled account while its cleanup is in progress.

The old EC2/database deployment remains an isolated rollback environment. The
SaaS cutover deploys `compose.cloud.yml` with a digest-pinned API and worker; it
must not run the destructive non-item reset against the live BMR database.

## Backup and restore

Database backup, retention, and restoration are configured and operated
directly through the selected infrastructure providers. Aurum POS does not run
application-managed backup jobs.

## Scale triggers

Start Terraform and an ALB/multi-instance design before adding a second host or when sustained CPU exceeds 60%, memory exceeds 70%, API p95 exceeds 500 ms, or single-host availability is no longer acceptable.
The API is stateless; session, durable jobs, outbox, entitlement, and worker-lease state live in PostgreSQL.
Before raising API worker counts, keep the sum of every process's `DATABASE_POOL_SIZE + DATABASE_MAX_OVERFLOW` below the Aiven connection limit with room for migrations and operations.
