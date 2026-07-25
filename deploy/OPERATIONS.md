# Aurum Cloud lean operations

The validation deployment is one ARM64 `t4g.small` instance plus Aiven PostgreSQL.
The instance has an Elastic IP, exposes only ports 80/443, and is administered
through SSM. `api.aurumpos.net` points to the Elastic IP. Host Nginx proxies to
the loopback-only API port, and Certbot manages TLS.

## Required preparation

- Attach a least-privilege instance role for SSM, CloudWatch, SES, and object-scoped `s3:GetObject` and `s3:PutObject` access to `arn:aws:s3:::aurum-pos-prod-duelistraj/shops/*`.
- Install Nginx, Certbot with its Nginx plugin, Docker Compose, AWS CLI, and Git.
- Allowlist the Elastic IP in Aiven and use a TLS pool URL for the application.
- Retrieve the runtime configuration from an encrypted AWS parameter and
  install it as `.env` on the host with mode `0600`; never commit the file.
  Compose loads that file into the API and worker containers.
- Configure SES DKIM/SPF/DMARC for `aurumpos.net`, Google service credentials,
  Pub/Sub authenticated push (including the exact OIDC service-account email),
  and `api.aurumpos.net` DNS before deployment.
- Keep `aurum-pos-prod-duelistraj` private in `ap-southeast-1` with Block Public Access enabled.
- Set `AWS_REGION=ap-southeast-1`, `S3_INVOICE_BUCKET=aurum-pos-prod-duelistraj`, `S3_INVOICE_PREFIX=shops`, and `S3_PRESIGNED_URL_EXPIRY_SECONDS=600` in the runtime environment.

The boto3 credential chain automatically obtains temporary credentials from the EC2 instance role.
Never add `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` to the production runtime file.
Local operators may use `aws configure`, `AWS_PROFILE`, or temporary credentials exported in their shell.

PostgreSQL is the authoritative invoice index, and the API reads exact object keys from authorized sale rows.
The application never lists the bucket and does not support invoice deletion, so `s3:ListBucket` and `s3:DeleteObject` are intentionally not required.

## Deployment

Set `AURUM_IMAGE` to the tested GHCR digest, then run `deploy/deploy.sh` through
SSM. The script refuses mutable tags, runs the migration from the same image,
starts the API and worker, and checks readiness. Nginx remains a host service
and proxies to `127.0.0.1:8000`.

Keep the prior image digest for application rollback. Database migrations must
remain backward-compatible after the initial clean-database SaaS cutover. The
legacy BMR rollback is its isolated old deployment, not an application rollback
against the new schema.

The old EC2/database deployment remains an isolated rollback environment. The
SaaS cutover deploys `compose.cloud.yml` with a digest-pinned API and worker; it
must not run the destructive non-item reset against the live BMR database.

## Backup and restore

Database backup, retention, and restoration are configured and operated
directly through the selected infrastructure providers. Aurum POS does not run
application-managed backup jobs.

## Scale triggers

Start Terraform and an ALB/multi-instance design before adding a second host or
when sustained CPU exceeds 60%, memory exceeds 70%, API p95 exceeds 500 ms, or
single-host availability is no longer acceptable. The API is stateless; session,
outbox, and entitlement state live in PostgreSQL.
