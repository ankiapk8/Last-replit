/**
 * Agent runner — the core execution loop.
 * Handles: provider calls, tool execution, streaming events, approval policies.
 */

import { randomUUID } from "node:crypto";
import { logger } from "../lib/logger";
import {
  getOrCreateProvider,
  detectProvider,
  detectFallbackProvider,
  type ChatMessage,
  type ToolCall,
  type ToolDefinition,
} from "../providers";
import { type ToolResult } from "../tools/types";
import { getTool, getToolsForMode, isToolAllowed } from "../tools/registry";
import { type AgentMode, type AgentSession, type AgentEvent, DEFAULT_MODES } from "./types";

// ─── Session Store (in-memory; replace with DB in production) ─────────────────

const sessions: Map<string, AgentSession> = new Map();

export function createSession(
  userId: string,
  modeId: string,
  workspaceId: string | null
): AgentSession {
  const mode = DEFAULT_MODES.find((m) => m.id === modeId) || DEFAULT_MODES[0];
  const session: AgentSession = {
    id: randomUUID(),
    userId,
    workspaceId,
    mode,
    messages: [],
    status: "idle",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): AgentSession | undefined {
  return sessions.get(id);
}

// ─── Agent Runner ──────────────────────────────────────────────────────────────

export async function* runAgent(
  session: AgentSession,
  userMessage: string
): AsyncGenerator<AgentEvent> {
  const mode = session.mode;
  session.status = "running";
  session.updatedAt = new Date();

  yield {
    type: "start",
    sessionId: session.id,
    mode: mode.id,
    model: mode.model,
  };

  // Build messages
  const messages: ChatMessage[] = [
    { role: "system", content: mode.systemPrompt },
    ...session.messages,
    { role: "user", content: userMessage },
  ];

  // Get provider
  const { name: providerName, config: providerConfig } = detectProvider();
  const provider = getOrCreateProvider(providerName, providerConfig);

  // Get allowed tools
  const allowedTools = getToolsForMode(mode.tools);
  const toolDefinitions: ToolDefinition[] = allowedTools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.definition.name,
      description: t.definition.description,
      parameters: t.definition.parameters,
    },
  }));

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let toolCallCount = 0;
  const maxToolCalls = mode.maxToolCalls;

  try {
    // Agent loop: call LLM → execute tools → repeat until done
    let done = false;
    while (!done && toolCallCount < maxToolCalls) {
      yield { type: "status", status: "thinking" };

      // Call provider
      const result = await provider.chat({
        model: mode.model,
        messages,
        tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
        maxTokens: mode.maxTokens,
        temperature: mode.temperature,
        timeoutMs: mode.timeoutMs,
      });

      // Track usage
      totalPromptTokens += result.usage.promptTokens;
      totalCompletionTokens += result.usage.completionTokens;

      // Add assistant message to history
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: result.content,
        tool_calls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
      };
      messages.push(assistantMsg);
      session.messages.push(assistantMsg);

      // Yield content
      if (result.content) {
        yield { type: "status", status: "streaming" };
        yield { type: "token", content: result.content };
      }

      // Execute tool calls if any
      if (result.toolCalls.length > 0) {
        yield { type: "status", status: "tool_calling" };

        for (const toolCall of result.toolCalls) {
          toolCallCount++;

          const toolName = toolCall.function.name;
          let toolInput: Record<string, unknown> = {};
          try {
            toolInput = JSON.parse(toolCall.function.arguments || "{}");
          } catch {
            yield {
              type: "tool_call_error",
              toolCallId: toolCall.id,
              toolName,
              error: "Failed to parse tool arguments as JSON",
            };
            continue;
          }

          // Check permission
          if (!isToolAllowed(toolName, mode.tools)) {
            yield {
              type: "tool_call_error",
              toolCallId: toolCall.id,
              toolName,
              error: `Tool '${toolName}' is not allowed in ${mode.id} mode`,
            };
            continue;
          }

          const tool = getTool(toolName);
          if (!tool) {
            yield {
              type: "tool_call_error",
              toolCallId: toolCall.id,
              toolName,
              error: `Unknown tool: ${toolName}`,
            };
            continue;
          }

          yield {
            type: "tool_call_start",
            toolCallId: toolCall.id,
            toolName,
            input: toolInput,
          };

          const startTime = Date.now();
          let toolResult: ToolResult;
          try {
            toolResult = await tool.execute(toolInput, {
              workspaceId: session.workspaceId || "default",
              userId: session.userId,
              agentMode: mode.id,
              signal: AbortSignal.timeout(60_000),
            });
          } catch (err) {
            toolResult = {
              content: `Tool execution error: ${err instanceof Error ? err.message : String(err)}`,
              isError: true,
            };
          }

          const durationMs = Date.now() - startTime;

          yield {
            type: "tool_call_end",
            toolCallId: toolCall.id,
            toolName,
            result: toolResult.content,
            durationMs,
          };

          // Add tool result to messages
          messages.push({
            role: "tool",
            content: toolResult.content,
            tool_call_id: toolCall.id,
          });
          session.messages.push({
            role: "tool",
            content: toolResult.content,
            tool_call_id: toolCall.id,
          });
        }

        // Continue loop to let LLM process tool results
        done = false;
      } else {
        // No tool calls — we're done
        done = true;
      }
    }

    if (toolCallCount >= maxToolCalls) {
      logger.warn(
        { sessionId: session.id, toolCallCount, maxToolCalls },
        "Agent reached max tool calls"
      );
    }

    session.status = "completed";
    session.updatedAt = new Date();

    yield {
      type: "usage",
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
    };

    yield {
      type: "done",
      reason: toolCallCount >= maxToolCalls ? "tool_calls" : "stop",
      usage: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
      },
    };
  } catch (err) {
    session.status = "error";
    session.updatedAt = new Date();

    const message = err instanceof Error ? err.message : String(err);
    logger.error({ sessionId: session.id, err: message }, "Agent run failed");

    yield {
      type: "error",
      code: "AGENT_ERROR",
      message,
    };

    yield {
      type: "done",
      reason: "error",
      usage: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
      },
    };
  }
}
