/**
 * Filesystem tools — read and write files within workspace boundaries.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { BaseTool, type ToolContext, type ToolResult } from "./types";

export class FilesystemReadTool extends BaseTool {
  readonly definition = {
    name: "filesystem.read",
    description: "Read the contents of a file. Returns the file content as text.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative path to the file within the workspace",
        },
      },
      required: ["path"],
    },
  };

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const { path: filePath } = input as { path: string };
    const safePath = this.resolvePath(filePath, context.workspaceId);

    try {
      const content = await fs.readFile(safePath, "utf-8");
      return { content, isError: false };
    } catch (err) {
      return {
        content: `Error reading file: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  }

  private resolvePath(inputPath: string, workspaceId: string): string {
    const workspaceRoot = path.resolve(
      process.env.AGENT_WORKSPACE_PATH || "/workspaces",
      workspaceId
    );
    const resolved = path.resolve(workspaceRoot, inputPath);
    // Security: prevent path traversal outside workspace
    if (!resolved.startsWith(workspaceRoot)) {
      throw new Error("Path traversal detected — access denied");
    }
    return resolved;
  }
}

export class FilesystemWriteTool extends BaseTool {
  readonly definition = {
    name: "filesystem.write",
    description:
      "Write content to a file. Creates the file if it doesn't exist, overwrites if it does.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative path to the file within the workspace",
        },
        content: {
          type: "string",
          description: "Content to write to the file",
        },
      },
      required: ["path", "content"],
    },
  };

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const { path: filePath, content } = input as { path: string; content: string };
    const safePath = this.resolvePath(filePath, context.workspaceId);

    try {
      await fs.mkdir(path.dirname(safePath), { recursive: true });
      await fs.writeFile(safePath, content, "utf-8");
      return {
        content: `File written successfully: ${filePath}`,
        isError: false,
        metadata: { bytesWritten: Buffer.byteLength(content, "utf-8") },
      };
    } catch (err) {
      return {
        content: `Error writing file: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  }

  private resolvePath(inputPath: string, workspaceId: string): string {
    const workspaceRoot = path.resolve(
      process.env.AGENT_WORKSPACE_PATH || "/workspaces",
      workspaceId
    );
    const resolved = path.resolve(workspaceRoot, inputPath);
    if (!resolved.startsWith(workspaceRoot)) {
      throw new Error("Path traversal detected — access denied");
    }
    return resolved;
  }
}
