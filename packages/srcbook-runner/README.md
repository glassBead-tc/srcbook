# @srcbook/runner

Headless Srcbook runner for Cloud Run Jobs tasks. Each task reads `CLOUD_RUN_TASK_INDEX` and `CLOUD_RUN_TASK_COUNT` to compute its parameter slice, executes a notebook/simulation, and writes artifacts to GCS.

## Local dev

Example dry run without GCP:

```bash
LOCAL_TASK_INDEX=3 LOCAL_TASK_COUNT=12 OUTPUT_BUCKET="local-dummy" \
PARAM_SPEC_JSON='{"grid":{"beta":[0.1,0.2,0.3],"gamma":[0.01,0.1],"seed":[0,1]}}' \
NB_PATH="notebooks/sim.ts" \
pnpm dev
```

You should see a JSON line with `status:"ok"` and a warning if `LOCAL_TASK_COUNT != totalPoints`.