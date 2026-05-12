/**
 * MCP (Model Context Protocol) client.
 * Supports stdio and HTTP transports for dynamic tool discovery.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { logger } from "../lib/logger";
import type { ToolDefinition } from "../providers/base";

export interface MCPServerConfig {
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

interface MCPRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

export class MCPClient {
  private config: MCPServerConfig;
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private tools: ToolDefinition[] = [];
  private connected = false;

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get serverName(): string {
    return this.config.name;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    if (this.config.transport === "stdio") {
      await this.connectStdio();
    } else if (this.config.transport === "http") {
      await this.connectHTTP();
    } else {
      throw new Error(`Unsupported transport: ${this.config.transport}`);
    }

    this.connected = true;
    logger.info(
      { server: this.config.name, transport: this.config.transport },
      "MCP server connected"
    );
  }

  private async connectStdio(): Promise<void> {
    if (!this.config.command) {
      throw new Error("stdio transport requires a command");
    }

    this.process = spawn(this.config.command, this.config.args || [], {
      env: { ...process.env, ...this.config.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let buffer = "";
    this.process.stdout!.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line) as MCPResponse;
            this.handleResponse(response);
          } catch {
            // Ignore non-JSON output
          }
        }
      }
    });

    this.process.stderr!.on("data", (data: Buffer) => {
      logger.debug(
        { server: this.config.name, output: data.toString().trim() },
        "MCP server stderr"
      );
    });

    this.process.on("exit", (code) => {
      this.connected = false;
      logger.warn({ server: this.config.name, exitCode: code }, "MCP server process exited");
    });

    await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "agent-backend", version: "1.0.0" },
    });
  }

  private async connectHTTP(): Promise<void> {
    if (!this.config.url) {
      throw new Error("http transport requires a URL");
    }

    const response = await fetch(this.config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.config.headers,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "agent-backend", version: "1.0.0" },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`MCP HTTP server returned ${response.status}: ${response.statusText}`);
    }
  }

  async listTools(): Promise<ToolDefinition[]> {
    const result = await this.sendRequest("tools/list", {});
    const tools = (result as { tools: ToolDefinition[] })?.tools || [];
    this.tools = tools;
    return tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ content: string; isError: boolean }> {
    const result = await this.sendRequest("tools/call", {
      name,
      arguments: args,
    });

    const content = (result as any)?.content || [];
    const textParts = content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");

    return {
      content: textParts || JSON.stringify(result),
      isError: !!(result as any)?.isError,
    };
  }

  private sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = ++this.requestId;
    const request: MCPRequest = { jsonrpc: "2.0", id, method, params };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      if (this.config.transport === "stdio" && this.process?.stdin) {
        this.process.stdin.write(JSON.stringify(request) + "\n");
      } else if (this.config.transport === "http" && this.config.url) {
        fetch(this.config.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...this.config.headers,
          },
          body: JSON.stringify(request),
        })
          .then((res) => res.json())
          .then((response: MCPResponse) => {
            this.handleResponse(response);
          })
          .catch(reject);
      }

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 30_000);
    });
  }

  private handleResponse(response: MCPResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) return;

    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.connected = false;
    this.pendingRequests.clear();
    logger.info({ server: this.config.name }, "MCP server disconnected");
  }
}
