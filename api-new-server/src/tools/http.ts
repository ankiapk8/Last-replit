/**
 * HTTP tool — make HTTP requests with full control over method, headers, and body.
 */

import { BaseTool, type ToolContext, type ToolResult } from "./types";

export class HttpRequestTool extends BaseTool {
  readonly definition = {
    name: "http.request",
    description:
      "Make an HTTP request. Supports GET, POST, PUT, DELETE, PATCH. Returns the response body and status.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to send the request to",
        },
        method: {
          type: "string",
          enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
          description: "HTTP method (default: GET)",
        },
        headers: {
          type: "object",
          description: "Request headers as key-value pairs",
        },
        body: {
          type: "string",
          description: "Request body (for POST, PUT, PATCH)",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds (default 30000)",
        },
      },
      required: ["url"],
    },
  };

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const {
      url,
      method = "GET",
      headers = {},
      body,
      timeout = 30_000,
    } = input as {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      timeout?: number;
    };

    try {
      const controller = new AbortController();
      const effectiveTimeout = Math.min(timeout, 120_000);
      const timer = setTimeout(() => controller.abort(), effectiveTimeout);

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: body || undefined,
        signal: AbortSignal.any([controller.signal, context.signal]),
      });

      clearTimeout(timer);

      const responseBody = await response.text();
      const maxLength = 10_000;
      const truncated =
        responseBody.length > maxLength
          ? responseBody.slice(0, maxLength) + "\n... (truncated)"
          : responseBody;

      return {
        content: truncated || "(empty response)",
        isError: !response.ok,
        metadata: {
          statusCode: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
        },
      };
    } catch (err) {
      return {
        content: `HTTP request failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  }
}
