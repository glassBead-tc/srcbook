#!/usr/bin/env bash
set -euo pipefail
REGION=${REGION:-us-central1}
PROJ=${PROJECT_ID:?}
REPO=${REPO:-srcbook}
JOB=${JOB_NAME:-srcbook-sim}
IMAGE="us-docker.pkg.dev/${PROJ}/${REPO}/srcbook-runner:${TAG:-dev}"

#gcloud run jobs create "$JOB" --image "$IMAGE" ... # Using deploy to create/update

gcloud run jobs deploy "$JOB" \
  --image "$IMAGE" \
  --region "$REGION" \
  --task-timeout 3600s \
  --max-retries 1 \
  --service-account "srcbook-jobs@${PROJ}.iam.gserviceaccount.com" \
  --cpu 2 --memory 4Gi \
  --set-env-vars "OUTPUT_BUCKET=${BUCKET:?}" \
  --project "$PROJ"