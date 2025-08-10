import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { submitSweep, getStatus, cancelExec, fetchArtifact } from "./cloudrun.js";
import { getLogs } from "./logs.js";

const server = new McpServer({ name: "mcp-gcp-sweeper", version: "0.1.0" }, { capabilities: { tools: {} } });

server.tool(
  "submit_sweep",
  {
    type: "object",
    required: ["image", "region", "projectId", "spec", "bucket", "nbPath"],
    properties: {
      image: { type: "string" },
      projectId: { type: "string" },
      region: { type: "string" },
      jobName: { type: "string" },
      parallelism: { type: "integer" },
      timeoutSeconds: { type: "integer" },
      cpu: { type: "string" },
      memory: { type: "string" },
      spec: { type: "object" },
      bucket: { type: "string" },
      nbPath: { type: "string" }
    }
  },
  async (args) => {
    const res = await submitSweep(args as any);
    return { content: [{ type: "text", text: JSON.stringify(res) }] } as any;
  }
);

server.tool(
  "status",
  {
    type: "object",
    required: ["projectId", "region", "execution"],
    properties: { projectId: { type: "string" }, region: { type: "string" }, execution: { type: "string" } }
  },
  async (a) => {
    const r = await getStatus(a as any);
    return { content: [{ type: "text", text: JSON.stringify(r) }] } as any;
  }
);

server.tool(
  "logs",
  {
    type: "object",
    required: ["projectId", "region", "execution"],
    properties: {
      projectId: { type: "string" },
      region: { type: "string" },
      execution: { type: "string" },
      taskIndex: { type: "integer" },
      tail: { type: "integer" }
    }
  },
  async (a) => {
    const r = await getLogs(a as any);
    return { content: [{ type: "text", text: r }] } as any;
  }
);

server.tool(
  "cancel",
  {
    type: "object",
    required: ["projectId", "region", "execution"],
    properties: { projectId: { type: "string" }, region: { type: "string" }, execution: { type: "string" } }
  },
  async (a) => {
    const r = await cancelExec(a as any);
    return { content: [{ type: "text", text: JSON.stringify(r) }] } as any;
  }
);

server.tool(
  "fetch_artifact",
  {
    type: "object",
    required: ["bucket", "key"],
    properties: { bucket: { type: "string" }, key: { type: "string" }, expiresSec: { type: "integer" } }
  },
  async (a) => {
    const r = await fetchArtifact(a as any);
    return { content: [{ type: "text", text: JSON.stringify(r) }] } as any;
  }
);

const transport = new StdioServerTransport();
server.connect(transport).catch(err => {
  console.error(err);
  process.exit(1);
});