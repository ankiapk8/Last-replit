/**
 * Browser tool — fetch web content and return it as text.
 */

import { BaseTool, type ToolContext, type ToolResult } from "./types";

export class BrowserFetchTool extends BaseTool {
  readonly definition = {
    name: "browser.fetch",
    description: "Fetch the content of a URL. Returns the page content as text (HTML stripped).",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "HTTP or HTTPS URL to fetch",
        },
      },
      required: ["url"],
    },
  };

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const { url } = input as { url: string };

    // Security: only allow http/https
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return {
        content: "Only HTTP and HTTPS URLs are allowed",
        isError: true,
      };
    }

    // Security: block internal network addresses
    const blockedHosts = ["localhost", "127.0.0.1", "0.0.0.0", "169.254.169.254"];
    const urlObj = new URL(url);
    if (blockedHosts.includes(urlObj.hostname)) {
      return {
        content: "Access to internal network addresses is blocked",
        isError: true,
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);

      const response = await fetch(url, {
        signal: AbortSignal.any([controller.signal, context.signal]),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AgentBot/1.0)",
          Accept: "text/html, text/plain, application/json",
        },
        redirect: "follow",
      });

      clearTimeout(timeout);

      const contentType = response.headers.get("content-type") || "";
      const text = await response.text();

      // Simple HTML to text conversion
      let content = text;
      if (contentType.includes("text/html")) {
        content = text
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      // Truncate to reasonable size
      const maxLength = 10_000;
      if (content.length > maxLength) {
        content = content.slice(0, maxLength) + "\n... (truncated)";
      }

      return {
        content: content || "(empty response)",
        isError: !response.ok,
        metadata: {
          statusCode: response.status,
          contentType,
          url: response.url,
        },
      };
    } catch (err) {
      return {
        content: `Fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  }
}
