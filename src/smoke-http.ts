import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main() {
  const url = process.argv[2] ?? process.env.DCP_SERVER_URL ?? "http://127.0.0.1:5000/mcp";
  const client = new Client({
    name: "dcp-smoke-test",
    version: "0.1.0",
  });
  const transport = new StreamableHTTPClientTransport(new URL(url));

  await client.connect(transport);
  const result = await client.listTools();

  console.log(
    JSON.stringify(
      {
        ok: true,
        url,
        tool_count: result.tools.length,
        tools: result.tools.map((tool) => tool.name),
      },
      null,
      2,
    ),
  );

  await transport.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
