/**
 * Tool types — base tool interface, context, and result types.
 */

// ─── Tool Definition ───────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

// ─── Tool Context ──────────────────────────────────────────────────────────────

export interface ToolContext {
  workspaceId: string;
  userId: string;
  agentMode: string;
  signal: AbortSignal;
}

// ─── Tool Result ───────────────────────────────────────────────────────────────

export interface ToolResult {
  content: string;
  isError: boolean;
  metadata?: Record<string, unknown>;
}

// ─── Base Tool ─────────────────────────────────────────────────────────────────

export abstract class BaseTool {
  abstract readonly definition: ToolDefinition;

  abstract execute(input: unknown, context: ToolContext): Promise<ToolResult>;

  /** Validate input against the tool's JSON Schema */
  validateInput(input: unknown): { valid: boolean; errors?: string[] } {
    // Basic validation — can be enhanced with ajv for full JSON Schema validation
    if (!input || typeof input !== "object") {
      return { valid: false, errors: ["Input must be an object"] };
    }
    const schema = this.definition.parameters;
    const required = (schema.required as string[]) || [];
    const errors: string[] = [];
    for (const field of required) {
      if ((input as Record<string, unknown>)[field] === undefined) {
        errors.push(`Missing required field: ${field}`);
      }
    }
    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }
}

// ─── Tool Registration Entry ──────────────────────────────────────────────────

export interface ToolEntry {
  id: string; // e.g., "filesystem.read"
  tool: BaseTool;
  category: string;
  requiresApproval: boolean;
}
