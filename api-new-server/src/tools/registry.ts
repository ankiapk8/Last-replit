/**
 * Tool registry — manages tool registration, discovery, and permission checks.
 */

import { logger } from "../lib/logger";
import { BaseTool, type ToolEntry, type ToolDefinition } from "./types";

// ─── Registry ──────────────────────────────────────────────────────────────────

const tools: Map<string, ToolEntry> = new Map();

export function registerTool(
  id: string,
  tool: BaseTool,
  category: string,
  requiresApproval = false
): void {
  if (tools.has(id)) {
    logger.warn({ toolId: id }, "Tool already registered — overwriting");
  }
  tools.set(id, { id, tool, category, requiresApproval });
  logger.debug({ toolId: id, category }, "Tool registered");
}

export function getTool(id: string): BaseTool | undefined {
  return tools.get(id)?.tool;
}

export function getToolEntry(id: string): ToolEntry | undefined {
  return tools.get(id);
}

export function listTools(): ToolEntry[] {
  return Array.from(tools.values());
}

export function listToolDefinitions(): ToolDefinition[] {
  return Array.from(tools.values()).map((entry) => entry.tool.definition);
}

export function isToolAllowed(toolId: string, allowedTools: string[]): boolean {
  if (allowedTools.includes("*")) return true;
  return allowedTools.includes(toolId);
}

export function getToolsForMode(allowedTools: string[]): BaseTool[] {
  if (allowedTools.includes("*")) {
    return Array.from(tools.values()).map((e) => e.tool);
  }
  return allowedTools
    .map((id) => tools.get(id)?.tool)
    .filter((t): t is BaseTool => t !== undefined);
}

export function clearRegistry(): void {
  tools.clear();
}
