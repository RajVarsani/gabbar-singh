import type Anthropic from "@anthropic-ai/sdk";
import { slackTools, executeSlackTool } from "./slack.js";
import { memoryTools, executeMemoryTool } from "./memory.js";
import { log } from "../../log.js";

const slackToolNames = new Set(slackTools.map((t) => t.name));
const memoryToolNames = new Set(memoryTools.map((t) => t.name));

export function getAllTools(): Anthropic.Tool[] {
  return [...slackTools, ...memoryTools];
}

export async function executeToolCall(
  name: string,
  input: Record<string, any>
): Promise<string> {
  try {
    if (slackToolNames.has(name)) {
      return await executeSlackTool(name, input);
    }
    if (memoryToolNames.has(name)) {
      return await executeMemoryTool(name, input);
    }
    return `unknown tool: ${name}`;
  } catch (err: any) {
    log("TOOL:ERROR", name, err?.message ?? err);
    return `error executing ${name}: ${err?.message ?? "unknown error"}`;
  }
}
