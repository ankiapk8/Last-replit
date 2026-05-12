/**
 * Terminal tool — execute shell commands within a sandboxed environment.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { BaseTool, type ToolContext, type ToolResult } from "./types";

const execAsync = promisify(exec);

// Commands that are never allowed
const BLOCKED_COMMANDS = [
  "rm -rf /",
  "rm -rf /*",
  "mkfs",
  "dd if=",
  ":(){:|:&};:",
  "chmod -R 777 /",
  "chown -R",
];

export class TerminalExecTool extends BaseTool {
  readonly definition = {
    name: "terminal.exec",
    description:
      "Execute a shell command. Returns stdout and stderr. Commands run in the workspace directory.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Shell command to execute",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds (default 30000, max 120000)",
        },
      },
      required: ["command"],
    },
  };

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const { command, timeout = 30_000 } = input as {
      command: string;
      timeout?: number;
    };

    // Security: check blocked commands
    const isBlocked = BLOCKED_COMMANDS.some((blocked) => command.includes(blocked));
    if (isBlocked) {
      return {
        content: `Command blocked for security reasons: ${command}`,
        isError: true,
      };
    }

    const workspaceRoot = path.resolve(
      process.env.AGENT_WORKSPACE_PATH || "/workspaces",
      context.workspaceId
    );

    const effectiveTimeout = Math.min(timeout, 120_000);

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: workspaceRoot,
        timeout: effectiveTimeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB output limit
        env: {
          ...process.env,
          PATH: "/usr/local/bin:/usr/bin:/bin",
        },
      });

      const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");

      return {
        content: output || "(command produced no output)",
        isError: false,
        metadata: { exitCode: 0 },
      };
    } catch (err: any) {
      const output = [err.stdout?.trim() || "", err.stderr?.trim() || "", err.message || ""]
        .filter(Boolean)
        .join("\n");

      return {
        content: output || `Command failed: ${err.message}`,
        isError: true,
        metadata: { exitCode: err.code || 1 },
      };
    }
  }
}
