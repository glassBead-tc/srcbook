# Srcbook GCP Sweeper Monorepo

Monorepo with:
- `@srcbook/runner`: headless Cloud Run Jobs task runner writing artifacts to GCS
- `@srcbook/mcp-gcp-sweeper`: MCP server exposing tools to submit/inspect/cancel sweeps
- `infra/`: scripts for Artifact Registry, bucket, IAM, and Cloud Run Job

## Build runner image

```bash
gcloud builds submit packages/srcbook-runner \
  --tag us-docker.pkg.dev/$PROJECT_ID/srcbook/srcbook-runner:$TAG
```

## Definition of Done
- DoD‑1: `@srcbook/runner` builds and runs locally; writes `result.json` to GCS when creds exist
- DoD‑2: `@srcbook/mcp-gcp-sweeper` exposes 5 tools; submit returns an execution; status/logs/cancel work; fetch_artifact returns signed URL or gs://
- DoD‑3: `infra/*` scripts create Artifact Registry, bucket, SAs, IAM, and job
