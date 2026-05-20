#!/usr/bin/env bash
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID to your GCP project id.}"
: "${REGION:=us-central1}"
: "${SERVICE_NAME:=kidspeak-family-response}"
: "${ARTIFACT_REPO:=kidspeak}"

gcloud config set project "${PROJECT_ID}"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com storage.googleapis.com secretmanager.googleapis.com logging.googleapis.com

gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=_REGION="${REGION}",_SERVICE="${SERVICE_NAME}",_ARTIFACT_REPO="${ARTIFACT_REPO}"

echo "Deployed ${SERVICE_NAME} to Cloud Run in ${REGION}."
echo "Set Cloud Logging retention separately, for example:"
echo "gcloud logging buckets update _Default --location=global --retention-days=7"
