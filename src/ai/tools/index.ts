import type Anthropic from "@anthropic-ai/sdk";
import { slackTools, executeSlackTool } from "./slack.js";
import { memoryTools, executeMemoryTool } from "./memory.js";
import { log } from "../../log.js";

const slackToolNames = new Set(slackTools.map((t) => t.name));
const memoryToolNames = new Set(memoryTools.map((t) => t.name));

export type ToolExecContext = {
  // tools that write to slack (post_message, add_reaction) may only target
  // these channels. protects against prompt-injection redirecting output.
  allowedChannels?: string[];
  // tools that mutate memory (save_memories, update_core_memory) are only
  // allowed when the triggering sender is the owner.
  isOwner?: boolean;
};

export function getAllTools(): Anthropic.Tool[] {
  return [...slackTools, ...memoryTools];
}

export async function executeToolCall(
  name: string,
  input: Record<string, any>,
  ctx: ToolExecContext = {}
): Promise<string> {
  try {
    if (slackToolNames.has(name)) {
      return await executeSlackTool(name, input, ctx);
    }
    if (memoryToolNames.has(name)) {
      return await executeMemoryTool(name, input, ctx);
    }
    return `unknown tool: ${name}`;
  } catch (err: any) {
    log("TOOL:ERROR", name, err?.message ?? err);
    return `error executing ${name}: ${err?.message ?? "unknown error"}`;
  }
}
