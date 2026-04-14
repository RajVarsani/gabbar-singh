import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { getAllTools, executeToolCall } from "./tools/index.js";
import { log } from "../log.js";
import type { ConversationMessage } from "../store/redis.js";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: config.anthropic.apiKey() });
  }
  return _client;
}

export type AgenticOptions = {
  systemPrompt: string;
  userMessage: string;
  history: ConversationMessage[];
  tools?: Anthropic.Tool[];
  model?: string;
  maxIterations?: number;
  timeBudgetMs?: number;
  maxTokens?: number;
};

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_TIME_BUDGET_MS = 50_000; // 50s, leave 10s for overhead
const MIN_TIME_FOR_ITERATION_MS = 8_000; // need at least 8s for a claude call

export async function agenticLoop(opts: AgenticOptions): Promise<string> {
  const client = getClient();
  const model = opts.model ?? DEFAULT_MODEL;
  const maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const timeBudget = opts.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const tools = opts.tools ?? getAllTools();
  const startTime = Date.now();

  // build initial messages from history + new user message
  const messages: Anthropic.MessageParam[] = [
    ...opts.history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: opts.userMessage },
  ];

  let finalText = "";

  for (let i = 0; i < maxIterations; i++) {
    const elapsed = Date.now() - startTime;
    const remaining = timeBudget - elapsed;

    if (remaining < MIN_TIME_FOR_ITERATION_MS) {
      log(
        "AGENT",
        `time budget exhausted at iteration ${i}, ${remaining}ms remaining`
      );
      break;
    }

    log("AGENT", `iteration ${i + 1}/${maxIterations}, ${remaining}ms left`);

    const response = await client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.systemPrompt,
      messages,
      tools: tools.length > 0 ? tools : undefined,
    });

    // extract any text from this response
    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );
    if (textBlocks.length > 0) {
      finalText = textBlocks.map((b) => b.text).join("\n");
    }

    // check if we need to execute tools
    const toolBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (toolBlocks.length === 0 || response.stop_reason === "end_turn") {
      // no more tools to call — we're done
      log("AGENT", `completed at iteration ${i + 1}, stop: ${response.stop_reason}`);
      break;
    }

    // append assistant response to conversation
    messages.push({ role: "assistant", content: response.content });

    // execute all tool calls and build results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolBlocks) {
      log("AGENT", `calling tool: ${block.name}`);
      const result = await executeToolCall(
        block.name,
        block.input as Record<string, any>
      );
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
      });
    }

    // feed tool results back to claude
    messages.push({ role: "user", content: toolResults });
  }

  return finalText || "hmm, got nothing. try again?";
}

// simple non-agentic call for cheap tasks (classification, extraction)
export async function quickCall(
  systemPrompt: string,
  userMessage: string,
  model: string = "claude-haiku-4-5-20251001",
  maxTokens: number = 256
): Promise<string> {
  const client = getClient();
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content.find((b) => b.type === "text");
  return text?.text ?? "";
}
