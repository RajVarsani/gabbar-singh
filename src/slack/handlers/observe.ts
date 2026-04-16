import { classifyEvent } from "../../ai/classify.js";
import { agenticLoop, quickCall } from "../../ai/client.js";
import { buildSystemPrompt } from "../../ai/system-prompt.js";
import { saveMemory } from "../../memory/episodic.js";
import { getCoreMemory, formatCoreMemory } from "../../memory/core.js";
import { recallMemories } from "../../memory/episodic.js";
import { postMessage } from "../client.js";
import { redisGet, redisSet } from "../../store/redis.js";
import { log } from "../../log.js";

type ChannelEvent = {
  text?: string;
  user?: string;
  channel?: string;
  thread_ts?: string;
  ts?: string;
};

const EXTRACT_PROMPT = `extract one factual memory from this slack message. respond with JSON (no markdown):
{"fact": "...", "tags": ["tag1", "tag2"]}
if nothing worth remembering, respond with: null`;

const PROACTIVE_COOLDOWN = 600; // 10 minutes

function extractTags(text: string): string[] {
  const words = text.toLowerCase().split(/\s+/);
  return words
    .filter((w) => w.length > 3)
    .filter((w) => !["what", "when", "where", "which", "that", "this", "have", "been", "will", "from", "they", "their", "about", "would", "could", "should"].includes(w))
    .slice(0, 5);
}

export async function handleObserve(event: ChannelEvent): Promise<void> {
  const { text, user, channel, thread_ts, ts } = event;
  if (!text || !channel || !ts) return;

  const classification = await classifyEvent(text, user);
  log("OBSERVE", `classification=${classification} channel=${channel} text="${text.slice(0, 60)}"`);

  switch (classification) {
    case "ignore":
      return;

    case "observe": {
      try {
        const result = await quickCall(EXTRACT_PROMPT, `[${user}] ${text}`);
        const cleaned = result.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
        if (cleaned && cleaned !== "null") {
          const parsed = JSON.parse(cleaned);
          if (parsed?.fact && parsed?.tags) {
            await saveMemory(parsed.fact, parsed.tags, 3, `${channel}:${ts}`);
          }
        }
      } catch (err) {
        log("OBSERVE:EXTRACT_ERR", err);
      }
      return;
    }

    case "proactive": {
      const cooldownKey = `gabbar:cooldown:${channel}`;
      const existing = await redisGet<number>(cooldownKey);
      if (existing) {
        log("OBSERVE", `proactive skipped — cooldown active for ${channel}`);
        return;
      }
      await redisSet(cooldownKey, 1, PROACTIVE_COOLDOWN);

      try {
        const threadTs_ = thread_ts ?? ts;

        const [coreMemory, relevantMemories] = await Promise.all([
          getCoreMemory(),
          recallMemories(extractTags(text)),
        ]);

        const systemPrompt = buildSystemPrompt({
          coreMemory: formatCoreMemory(coreMemory),
          relevantMemories: relevantMemories.map((m) => m.fact),
          triggerType: "proactive",
        });

        log("OBSERVE:PROACTIVE", `channel=${channel} text="${text.slice(0, 80)}"`);

        const response = await agenticLoop({
          systemPrompt,
          userMessage: text,
          history: [],
          maxIterations: 5,
          timeBudgetMs: 30_000,
        });

        if (response && response.length > 0) {
          await postMessage(channel, response, threadTs_);
        }
      } catch (err) {
        log("OBSERVE:PROACTIVE_ERR", err);
      }
      return;
    }
  }
}
