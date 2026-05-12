/**
 * Agent mode registry — manages mode definitions.
 * In production, modes would be stored in the DB. For now, use defaults + in-memory overrides.
 */

import { type AgentMode, DEFAULT_MODES } from "./types";

const modes: Map<string, AgentMode> = new Map(DEFAULT_MODES.map((m) => [m.id, m]));

export function getMode(id: string): AgentMode | undefined {
  return modes.get(id);
}

export function listModes(): AgentMode[] {
  return Array.from(modes.values());
}

export function registerMode(mode: AgentMode): void {
  modes.set(mode.id, mode);
}

export function getDefaultMode(): AgentMode {
  return modes.get("ask") || DEFAULT_MODES[0];
}
