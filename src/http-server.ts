import { createServer, type Server } from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { Request, Response } from "express";

import type { DcpService } from "./dcp/dcp.service.js";
import { createMcpServer } from "./mcp-server.js";

export interface HttpServerOptions {
  host: string;
  port: number;
}

export async function startHttpServer(
  service: DcpService,
  options: HttpServerOptions,
): Promise<Server> {
  const app = createMcpExpressApp({ host: options.host });

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      ok: true,
      name: "dcp",
      transport: "http",
      host: options.host,
      port: options.port,
    });
  });

  app.post("/mcp", async (req: Request, res: Response) => {
    const server = createMcpServer(service);

    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      console.error("Failed to handle MCP request:", error);

      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  });

  app.all("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    });
  });

  return await new Promise<Server>((resolve, reject) => {
    const server = createServer(app);

    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}
