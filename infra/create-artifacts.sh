#!/usr/bin/env bash
set -euo pipefail
REGION=${REGION:-us-central1}
PROJ=${PROJECT_ID:?set PROJECT_ID}
REPO=${REPO:-srcbook}
gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" --description="Srcbook images" || true