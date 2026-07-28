# Aurum Cloud operations

## Production source of truth

The private `aurum-pos-ops` repository owns Aurum Cloud deployment authority, the selected image digest, the production runtime key manifest, host bootstrap, rollback, and AWS deployment workflows.
This public repository owns application CI, immutable GHCR image publishing, the Android build, and the signed Google Play release workflow.
The public `compose.cloud.yml` and `deploy/deploy.sh` files are reference templates for self-hosting and recovery.
They are not used for routine Aurum Cloud deployment.

## Current hosted configuration

Production runtime values are already configured as individual Standard SecureStrings under `/aurum-pos/production/` in AWS Systems Manager Parameter Store.
SecureString values are encrypted at rest with AWS KMS.
The private operations repository contains the authoritative runtime key list.
Every deployment fetches those exact parameters, validates the complete contract, and atomically writes `/opt/aurum-pos/.env` with mode `0600`.
An operator does not need a local production `.env`, and GitHub Actions does not receive the secret values.

`DATABASE_URL` uses the restricted application role.
`MIGRATION_DATABASE_URL` contains the database administrator connection used for schema migrations.
It is stored as a separate SecureString, excluded from the runtime `.env`, and passed only to the one-shot migration container.
This separation lets migrations change the schema without giving the API or worker administrator privileges.

The hosted topology is one ARM64 EC2 instance with host Nginx and Certbot in front of loopback-only API and worker containers, backed by Aiven PostgreSQL.
The application uses the EC2 instance role for SSM, SES, and object-scoped private S3 access instead of static AWS access keys.
Provider credentials, HTTPS DNS, TLS certificates, Google Play integration, and the production Parameter Store values are provisioned.
Bootstrap instructions in the private operations repository are only for a replacement host or disaster recovery.

## Android-first release flow

The official product is distributed through Google Play.
The web build supports the Android package and public account, legal, and recovery pages.

1. Push application code to `main` and wait for public CI to succeed.
2. Run `Release Android to Play Internal Testing` with the full tested commit SHA.
3. The workflow builds a signed AAB and uploads it directly to the Google Play Internal Testing track.
4. Promote the tested Play release to later tracks without rebuilding it.
5. Promote the backend image separately by opening an `aurum-pos-ops` pull request that changes only `production/image.env` to the immutable digest for the approved revision.
6. Merging that operations pull request deploys through GitHub OIDC and AWS SSM.

The automatic debug APK is a smoke-test artifact.
It is not the signed Play release.

## Production deployment behavior

The private deployment refreshes Parameter Store configuration, acquires a host lock, pauses the worker, and runs migrations before replacing the API.
It verifies liveness, database readiness, source revision, image digest, configuration revision, public HTTPS, and the replacement worker heartbeat.
Configuration-only Parameter Store changes require an explicit operations workflow dispatch because changing a parameter alone does not restart containers.
Rollback promotes a previous immutable image digest and does not automatically downgrade the database.
Production migrations must therefore remain compatible with the immediately previous application image.

## Public operator template

Self-hosters who use `compose.cloud.yml` must provide their own untracked `.env`, immutable `AURUM_IMAGE` digest, release metadata, HTTPS origin, provider credentials, TLS setup, and AWS permissions.
The public Compose template uses the CloudWatch logging driver and therefore requires access to its configured log groups.
Those inputs belong to a self-hosted deployment and are not missing tasks for the already provisioned Aurum Cloud environment.

Never store `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` in a production runtime file.
Use an instance role or another temporary AWS credential source.

## Data protection and recovery

PostgreSQL is the authoritative invoice index.
The application reads and deletes only exact private S3 object keys recorded in authorized sale rows and does not list the bucket.
Database backup, retention, and restoration are operated through AWS and Aiven rather than application-managed backup jobs.
Run an isolated restore drill before launch and at least quarterly.

## Scale gates

The single-host topology is pragmatic for the expected launch traffic.
Run the repository k6 scenario at 100 concurrent users before launch and after material query or topology changes.
Plan an ALB and multiple API instances before single-host availability becomes unacceptable or sustained CPU, memory, latency, database connections, or worker lag approach their limits.
Before a 10,000-user test, separate worker capacity from API capacity and validate the PostgreSQL connection budget with representative data.
