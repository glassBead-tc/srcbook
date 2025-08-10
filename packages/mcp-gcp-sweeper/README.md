# @srcbook/mcp-gcp-sweeper

MCP server exposing tools to submit and manage Cloud Run Jobs parameter sweeps. Tools:

- submit_sweep: create an execution with task arrays and pass sweep spec/env
- status: describe an execution
- logs: stream Cloud Logging for an execution (optionally a task index)
- cancel: cancel an execution
- fetch_artifact: return a gs:// URI or a signed URL for an artifact

Start locally:

```bash
pnpm --filter @srcbook/mcp-gcp-sweeper dev
```