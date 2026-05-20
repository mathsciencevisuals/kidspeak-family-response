# GitHub Actions To Cloud Run

This repo can deploy as a single Cloud Run service because `src/server/apiServer.ts` serves both:

- the built Vite frontend from `dist`
- the API routes under `/api/*`

The workflow file is:

- `.github/workflows/deploy-cloud-run.yml`

It mirrors the Fitme deploy shape:

- push to `main`
- manual dispatch
- Workload Identity Federation auth
- Docker build and push to Artifact Registry
- deploy through `google-github-actions/deploy-cloudrun`

Unlike Fitme, this repo does not need a separate migration job because it is not a Prisma/Postgres service.

## 1. Create A New GitHub Repo

Push this project to its own repository, for example:

- `kidsact`
- `kidspeak-family-response`

The workflow will run from that repo.

## 2. Configure GCP Authentication

Recommended path: GitHub Actions + Workload Identity Federation.

Create:

- a GCP service account for deploys, for example `github-cloud-run-deployer`
- a workload identity pool and provider bound to the GitHub repo

Grant the service account at least:

- `roles/run.admin`
- `roles/iam.serviceAccountUser`
- `roles/artifactregistry.writer`
- `roles/serviceusage.serviceUsageConsumer`

If the workflow must create Artifact Registry repositories, also grant:

- `roles/artifactregistry.admin`

## 3. Add GitHub Repository Variables

Add these repository variables in GitHub:

- `GCP_PROJECT_ID`: your GCP project id
- `GCP_REGION`: `us-central1` or your target region
- `GAR_REPOSITORY`: Docker Artifact Registry repo name, for example `kidspeak`
- `GAR_IMAGE`: image name, for example `kidspeak-family-response`
- `CLOUD_RUN_API_SERVICE`: Cloud Run service name, for example `kidspeak-family-response`

Optional:

- `CLOUD_RUN_EXTRA_ARGS`: extra Cloud Run deploy flags, for example:
  `--set-secrets=REDIS_URL=REDIS_URL:latest --set-env-vars=GOOGLE_CLOUD_PROJECT=my-project`

## 4. Add GitHub Repository Secrets

Add these repository secrets:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_DEPLOY_SERVICE_ACCOUNT`

Example values:

- `GCP_WORKLOAD_IDENTITY_PROVIDER=projects/123456789/locations/global/workloadIdentityPools/github/providers/my-repo`
- `GCP_DEPLOY_SERVICE_ACCOUNT=github-cloud-run-deployer@my-project.iam.gserviceaccount.com`

## 5. Recommended Runtime Configuration

The workflow deploys with these baseline runtime env vars:

- `NODE_ENV=production`
- `STORAGE_PROVIDER=firebase`
- `REQUIRE_AUTH=true`
- `DISABLE_REAL_AI=true`
- `USE_MOCK_TRANSCRIPTION=true`
- `USE_GEMINI_ANALYSIS=false`
- `USE_RULE_BASED_ANALYSIS=true`
- `STORE_RAW_AUDIO=false`
- `ENABLE_LIVE_COACH=false`
- `LOG_LEVEL=info`

Do not put sensitive values directly in the workflow. Pass them through:

- Secret Manager via `--set-secrets`
- non-sensitive repo variables via `CLOUD_RUN_EXTRA_ARGS`

## 6. First Deploy Checklist

Before the first push to `main`, make sure this GCP project already has:

- Cloud Run API enabled
- Artifact Registry API enabled
- Secret Manager API enabled
- Logging enabled
- Firestore or your chosen storage backend configured

If you plan to use Redis, BigQuery, or Cloud SQL later, keep them disabled until this app actually needs them.

## 7. Push Flow

After setup, the deployment loop is:

1. Commit locally
2. Push to `main`
3. GitHub Actions runs tests and build
4. Docker image is built and pushed to Artifact Registry
5. Cloud Run is updated automatically

## 8. Notes

- This workflow deploys one Cloud Run service, not separate web and API services.
- That is the lowest-friction setup for the current repo structure.
- If you later want a split architecture, keep the current workflow as the API/web baseline and split only when operationally necessary.
- APK/mobile local builds are a separate concern. This repo has no Expo or native mobile pipeline, so GitHub Actions here is only for Cloud Run deploy.
