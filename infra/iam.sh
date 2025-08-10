#!/usr/bin/env bash
set -euo pipefail
PROJ=${PROJECT_ID:?}
REGION=${REGION:-us-central1}

# Runtime SA (used by the Job's tasks)
RUNTIME_SA=srcbook-jobs@${PROJ}.iam.gserviceaccount.com
gcloud iam service-accounts create srcbook-jobs --display-name "Srcbook Jobs" || true
gcloud projects add-iam-policy-binding "$PROJ" --member="serviceAccount:$RUNTIME_SA" --role="roles/storage.objectAdmin"
# MCP server SA (if you deploy it)
MCP_SA=srcbook-mcp@${PROJ}.iam.gserviceaccount.com
gcloud iam service-accounts create srcbook-mcp --display-name "Srcbook MCP" || true
# Let MCP SA execute jobs and impersonate runtime SA while executing
gcloud projects add-iam-policy-binding "$PROJ" --member="serviceAccount:$MCP_SA" --role="roles/run.admin"
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:$MCP_SA" --role="roles/iam.serviceAccountUser"