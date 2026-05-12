/**
 * Short-term memory — session-scoped conversation history.
 * Stores messages in-memory with automatic context window management.
 */

import type { ChatMessage } from "../providers/base";

const sessionMessages: Map<string, ChatMessage[]> = new Map();

// Max messages to keep in short-term memory per session
const MAX_MESSAGES = 100;

export function getSessionMessages(sessionId: string): ChatMessage[] {
  return sessionMessages.get(sessionId) || [];
}

export function addSessionMessage(sessionId: string, message: ChatMessage): void {
  const messages = sessionMessages.get(sessionId) || [];
  messages.push(message);

  // Prune if exceeding max
  if (messages.length > MAX_MESSAGES) {
    // Keep system message (first) and trim from the second message
    const systemMsg = messages[0];
    const trimmed = messages.slice(-(MAX_MESSAGES - 1));
    sessionMessages.set(sessionId, [systemMsg, ...trimmed]);
  } else {
    sessionMessages.set(sessionId, messages);
  }
}

export function clearSessionMessages(sessionId: string): void {
  sessionMessages.delete(sessionId);
}

/**
 * Trim messages to fit within a token limit.
 * Keeps the system message and the most recent messages.
 */
export function trimToTokenLimit(
  messages: ChatMessage[],
  maxTokens: number
): ChatMessage[] {
  if (messages.length <= 2) return messages;

  // Rough estimate: 1 token ≈ 4 characters
  const estimateTokens = (msg: ChatMessage): number => {
    const content =
      typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    return Math.ceil(content.length / 4);
  };

  const systemMsg = messages[0];
  const conversation = messages.slice(1);

  let totalTokens = estimateTokens(systemMsg);
  const result: ChatMessage[] = [systemMsg];

  // Add messages from most recent to oldest
  for (let i = conversation.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(conversation[i]);
    if (totalTokens + msgTokens > maxTokens) break;
    result.splice(1, 0, conversation[i]);
    totalTokens += msgTokens;
  }

  return result;
}
