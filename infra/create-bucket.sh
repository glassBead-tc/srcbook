#!/usr/bin/env bash
set -euo pipefail
PROJ=${PROJECT_ID:?}
BUCKET=${BUCKET:?}
gsutil mb -p "$PROJ" -l US-CENTRAL1 "gs://$BUCKET" || true