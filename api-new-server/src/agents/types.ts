/**
 * Agent types — mode definitions, session state, and execution context.
 */

import type { ChatMessage, ToolDefinition } from "../providers/base";

// ─── Agent Mode ────────────────────────────────────────────────────────────────

export interface AgentMode {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  provider: string;
  tools: string[]; // Allowed tool IDs, ['*'] for all
  maxTokens: number;
  temperature: number;
  approvalPolicy: "auto" | "confirm" | "deny";
  maxToolCalls: number;
  timeoutMs: number;
}

// ─── Agent Session ─────────────────────────────────────────────────────────────

export interface AgentSession {
  id: string;
  userId: string;
  workspaceId: string | null;
  mode: AgentMode;
  messages: ChatMessage[];
  status: "idle" | "running" | "waiting_approval" | "completed" | "error";
  createdAt: Date;
  updatedAt: Date;
}

// ─── Agent Run Request ────────────────────────────────────────────────────────

export interface AgentRunRequest {
  sessionId?: string; // Continue existing session
  modeId: string;
  message: string;
  workspaceId?: string;
}

// ─── Agent Event (for streaming) ──────────────────────────────────────────────

export type AgentEvent =
  | { type: "start"; sessionId: string; mode: string; model: string }
  | { type: "token"; content: string }
  | { type: "tool_call_start"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool_call_end"; toolCallId: string; toolName: string; result: unknown; durationMs: number }
  | { type: "tool_call_error"; toolCallId: string; toolName: string; error: string }
  | { type: "status"; status: "thinking" | "tool_calling" | "streaming" | "done" | "error" }
  | { type: "usage"; promptTokens: number; completionTokens: number; totalTokens: number }
  | { type: "error"; code: string; message: string }
  | { type: "done"; reason: "stop" | "length" | "tool_calls" | "error"; usage: { promptTokens: number; completionTokens: number; totalTokens: number } };

// ─── Default Modes ─────────────────────────────────────────────────────────────

export const DEFAULT_MODES: AgentMode[] = [
  {
    id: "ask",
    name: "Ask",
    description: "Q&A mode — answer questions, explain concepts",
    systemPrompt:
      "You are a helpful assistant. Answer questions clearly and concisely. Use available tools when you need to look up information or perform actions.",
    model: "gpt-4o-mini",
    provider: "openai",
    tools: ["filesystem.read", "browser.fetch", "http.request"],
    maxTokens: 4096,
    temperature: 0.3,
    approvalPolicy: "auto",
    maxToolCalls: 5,
    timeoutMs: 60_000,
  },
  {
    id: "code",
    name: "Code",
    description: "Code generation and refactoring",
    systemPrompt:
      "You are an expert software engineer. Write clean, well-documented code. You have access to the filesystem and terminal. Always explain your changes.",
    model: "gpt-4o",
    provider: "openai",
    tools: ["*"],
    maxTokens: 8192,
    temperature: 0.2,
    approvalPolicy: "confirm",
    maxToolCalls: 20,
    timeoutMs: 120_000,
  },
  {
    id: "architect",
    name: "Architect",
    description: "System design and architecture planning",
    systemPrompt:
      "You are a principal software architect. Design scalable, maintainable systems. Consider trade-offs, patterns, and best practices. Use tools to research and validate approaches.",
    model: "gpt-4o",
    provider: "openai",
    tools: ["filesystem.read", "filesystem.write", "browser.fetch", "http.request"],
    maxTokens: 8192,
    temperature: 0.4,
    approvalPolicy: "auto",
    maxToolCalls: 10,
    timeoutMs: 90_000,
  },
  {
    id: "debug",
    name: "Debug",
    description: "Debugging and troubleshooting",
    systemPrompt:
      "You are an expert debugger. Analyze errors, find root causes, and suggest fixes. You can read files, run commands, and search for solutions. Be systematic in your approach.",
    model: "gpt-4o",
    provider: "openai",
    tools: ["filesystem.read", "filesystem.write", "terminal.exec", "browser.fetch"],
    maxTokens: 4096,
    temperature: 0.1,
    approvalPolicy: "confirm",
    maxToolCalls: 15,
    timeoutMs: 90_000,
  },
  {
    id: "research",
    name: "Research",
    description: "Deep research and analysis",
    systemPrompt:
      "You are a thorough researcher. Gather information from multiple sources, synthesize findings, and provide comprehensive analysis. Use tools to search, read, and compile information.",
    model: "gpt-4o",
    provider: "openai",
    tools: ["browser.fetch", "http.request", "filesystem.read", "filesystem.write"],
    maxTokens: 8192,
    temperature: 0.5,
    approvalPolicy: "auto",
    maxToolCalls: 20,
    timeoutMs: 180_000,
  },
];
