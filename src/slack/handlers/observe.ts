import { classifyEvent } from "../../ai/classify.js";
import { quickCall } from "../../ai/client.js";
import { saveMemory } from "../../memory/episodic.js";
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

export async function handleObserve(event: ChannelEvent): Promise<void> {
  const { text, user, channel, ts } = event;
  if (!text || !channel || !ts) return;

  const classification = await classifyEvent(text, user);
  log("OBSERVE", `classification=${classification} channel=${channel} text="${text.slice(0, 60)}"`);

  if (classification !== "observe") return;

  try {
    const result = await quickCall(EXTRACT_PROMPT, `[${user}] ${text}`);
    const cleaned = result
      .replace(/```json?\n?/g, "")
      .replace(/```/g, "")
      .trim();
    if (cleaned && cleaned !== "null") {
      const parsed = JSON.parse(cleaned);
      if (parsed?.fact && parsed?.tags) {
        await saveMemory(parsed.fact, parsed.tags, 3, `${channel}:${ts}`);
      }
    }
  } catch (err) {
    log("OBSERVE:EXTRACT_ERR", err);
  }
}
