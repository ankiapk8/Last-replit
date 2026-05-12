/**
 * Workspace manager — handles workspace CRUD and file storage.
 * Each user gets isolated workspaces with their own directories.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../lib/logger";

const WORKSPACE_ROOT = process.env.AGENT_WORKSPACE_PATH || "/workspaces";

export interface Workspace {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  config: Record<string, unknown>;
  storagePath: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const workspaces: Map<string, Workspace> = new Map();
const userDefaultWorkspaces: Map<string, string> = new Map();

function generateId(): string {
  return `ws_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function createWorkspace(
  userId: string,
  name: string,
  description?: string,
  isDefault = false
): Promise<Workspace> {
  const id = generateId();
  const storagePath = path.join(WORKSPACE_ROOT, id);

  await fs.mkdir(path.join(storagePath, "uploads"), { recursive: true });
  await fs.mkdir(path.join(storagePath, "generated"), { recursive: true });
  await fs.mkdir(path.join(storagePath, "checkpoints"), { recursive: true });
  await fs.mkdir(path.join(storagePath, "logs"), { recursive: true });

  const workspace: Workspace = {
    id,
    userId,
    name,
    description: description || null,
    config: {},
    storagePath,
    isDefault,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  workspaces.set(id, workspace);

  if (isDefault) {
    userDefaultWorkspaces.set(userId, id);
  }

  logger.info({ workspaceId: id, userId, name }, "Workspace created");
  return workspace;
}

export function getWorkspace(id: string): Workspace | undefined {
  return workspaces.get(id);
}

export function getUserWorkspaces(userId: string): Workspace[] {
  return Array.from(workspaces.values()).filter((w) => w.userId === userId);
}

export function getDefaultWorkspace(userId: string): Workspace | undefined {
  const id = userDefaultWorkspaces.get(userId);
  if (id) {
    const ws = workspaces.get(id);
    if (ws) return ws;
  }
  const userWorkspaces = getUserWorkspaces(userId);
  return userWorkspaces[0];
}

export async function ensureDefaultWorkspace(userId: string): Promise<Workspace> {
  const existing = getDefaultWorkspace(userId);
  if (existing) return existing;
  return createWorkspace(userId, "Default Workspace", "Your default workspace", true);
}

export async function deleteWorkspace(id: string): Promise<boolean> {
  const workspace = workspaces.get(id);
  if (!workspace) return false;

  try {
    await fs.rm(workspace.storagePath, { recursive: true, force: true });
  } catch (err) {
    logger.warn({ workspaceId: id, err }, "Failed to delete workspace directory");
  }

  workspaces.delete(id);
  if (userDefaultWorkspaces.get(workspace.userId) === id) {
    userDefaultWorkspaces.delete(workspace.userId);
  }

  logger.info({ workspaceId: id }, "Workspace deleted");
  return true;
}

export function getWorkspacePath(workspaceId: string, subPath?: string): string {
  const workspace = workspaces.get(workspaceId);
  const basePath = workspace ? workspace.storagePath : path.join(WORKSPACE_ROOT, workspaceId);
  if (!subPath) return basePath;
  return path.join(basePath, subPath);
}
