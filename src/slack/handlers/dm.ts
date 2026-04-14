import { agenticLoop } from "../../ai/client.js";
import { buildSystemPrompt } from "../../ai/system-prompt.js";
import { getThreadHistory, appendToThread } from "../../store/redis.js";
import { postMessage } from "../client.js";
import { getCoreMemory, formatCoreMemory } from "../../memory/core.js";
import { recallMemories } from "../../memory/episodic.js";
import { extractAndSaveMemories } from "../../memory/extract.js";
import { log } from "../../log.js";

type DMEvent = {
  text?: string;
  user?: string;
  channel?: string;
  thread_ts?: string;
  ts?: string;
};

function extractTags(text: string): string[] {
  const words = text.toLowerCase().split(/\s+/);
  return words
    .filter((w) => w.length > 3)
    .filter((w) => !["what", "when", "where", "which", "that", "this", "have", "been", "will", "from", "they", "their", "about", "would", "could", "should"].includes(w))
    .slice(0, 5);
}

export async function handleDM(event: DMEvent): Promise<void> {
  const { text, user, channel, thread_ts, ts } = event;
  if (!text || !channel || !ts) return;

  const threadTs = thread_ts ?? ts;

  try {
    const [history, coreMemory, relevantMemories] = await Promise.all([
      getThreadHistory(channel, threadTs),
      getCoreMemory(),
      recallMemories(extractTags(text)),
    ]);

    const systemPrompt = buildSystemPrompt({
      coreMemory: formatCoreMemory(coreMemory),
      relevantMemories: relevantMemories.map((m) => m.fact),
      triggerType: "dm",
    });

    log("DM", `user=${user} memories=${relevantMemories.length} text="${text.slice(0, 80)}"`);

    const response = await agenticLoop({
      systemPrompt,
      userMessage: text,
      history,
    });

    await postMessage(channel, response, thread_ts ? threadTs : undefined);
    await appendToThread(channel, threadTs, text, response);

    extractAndSaveMemories(text, response, `${channel}:${threadTs}`).catch(
      (err) => log("DM:EXTRACT_ERR", err)
    );
  } catch (err) {
    log("DM:ERROR", err);
    await postMessage(channel, "kuch gadbad ho gayi, try again later");
  }
}
