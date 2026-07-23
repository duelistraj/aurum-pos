# Aurum Cloud lean operations

The validation deployment is one ARM64 `t4g.small` instance plus Aiven PostgreSQL.
The instance has an Elastic IP, exposes only ports 80/443, and is administered
through SSM. `api.aurumpos.net` points to the Elastic IP. Host Nginx proxies to
the loopback-only API port, and Certbot manages TLS.

## Required preparation

- Attach a least-privilege instance role for SSM, CloudWatch, SES, and the backup S3 bucket.
- Install Nginx, Certbot with its Nginx plugin, Docker Compose, the PostgreSQL
  client, AWS CLI, and Git.
- Enable S3 versioning, default encryption, and a 35-day lifecycle policy.
- Allowlist the Elastic IP in Aiven and use TLS URLs. Runtime uses the pool URL;
  migrations and backups use the direct URL.
- Put `.env.cloud` on the host as root-readable only. Retrieve values from AWS
  secure parameters during provisioning; never commit the file.
- Configure SES DKIM/SPF/DMARC for `aurumpos.net`, Google service credentials,
  Pub/Sub authenticated push (including the exact OIDC service-account email),
  and `api.aurumpos.net` DNS before deployment.

## Deployment

Set `AURUM_IMAGE` to the tested GHCR digest, create a manual database backup,
then run `deploy/deploy.sh` through SSM. The script refuses mutable tags, runs
the migration from the same image, starts the API and worker, and checks
readiness. Nginx remains a host service and proxies to `127.0.0.1:8000`.

Keep the prior image digest for application rollback. Database migrations must
remain backward-compatible after the initial clean-database SaaS cutover. The
legacy BMR rollback is its isolated old deployment, not an application rollback
against the new schema.

The old EC2/database deployment remains an isolated rollback environment. The
SaaS cutover deploys `compose.cloud.yml` with a digest-pinned API and worker; it
must not run the destructive non-item reset against the live BMR database.

## Backup and restore

Run `deploy/backup-aiven.sh` daily from a systemd timer. Once per month, restore
the newest object into an isolated database, run Alembic current, compare row
counts, and record the result. Never validate a restore against production.

## Scale triggers

Start Terraform and an ALB/multi-instance design before adding a second host or
when sustained CPU exceeds 60%, memory exceeds 70%, API p95 exceeds 500 ms, or
single-host availability is no longer acceptable. The API is stateless; session,
outbox, and entitlement state live in PostgreSQL.
