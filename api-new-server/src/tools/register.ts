/**
 * Tool registration — registers all built-in tools with the registry.
 * Call this once at server startup.
 */

import { registerTool } from "./registry";
import { FilesystemReadTool, FilesystemWriteTool } from "./filesystem";
import { TerminalExecTool } from "./terminal";
import { BrowserFetchTool } from "./browser";
import { HttpRequestTool } from "./http";

export function registerBuiltInTools(): void {
  // Filesystem tools
  registerTool("filesystem.read", new FilesystemReadTool(), "filesystem", false);
  registerTool("filesystem.write", new FilesystemWriteTool(), "filesystem", true);

  // Terminal tools
  registerTool("terminal.exec", new TerminalExecTool(), "terminal", true);

  // Browser tools
  registerTool("browser.fetch", new BrowserFetchTool(), "browser", false);

  // HTTP tools
  registerTool("http.request", new HttpRequestTool(), "http", false);
}
