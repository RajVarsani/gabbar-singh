import { classifyEvent } from "../../ai/classify.js";
import { quickCall } from "../../ai/client.js";
import { saveMemory } from "../../memory/episodic.js";
import { addReaction } from "../client.js";
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

const EMOJI_PROMPT = `pick ONE emoji reaction for this slack message. respond with ONLY the emoji name (no colons, no explanation).
examples: thumbsup, fire, eyes, thinking_face, 100, rocket, heart`;

const PROACTIVE_COOLDOWN = 600; // 10 minutes

export async function handleObserve(event: ChannelEvent): Promise<void> {
  const { text, user, channel, ts } = event;
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

    case "react": {
      try {
        const emoji = await quickCall(EMOJI_PROMPT, text);
        const cleanEmoji = emoji.trim().replace(/:/g, "").toLowerCase();
        if (cleanEmoji && cleanEmoji.length < 30) {
          await addReaction(channel, ts, cleanEmoji);
        }
      } catch (err) {
        log("OBSERVE:REACT_ERR", err);
      }
      return;
    }

    case "proactive_check": {
      // rate limit: max 1 proactive action per channel per 10 min
      const cooldownKey = `gabbar:cooldown:${channel}`;
      const existing = await redisGet<number>(cooldownKey);
      if (existing) {
        log("OBSERVE", `proactive skipped — cooldown active for ${channel}`);
        return;
      }
      await redisSet(cooldownKey, 1, PROACTIVE_COOLDOWN);

      // for now, just log — full proactive response comes later
      log("OBSERVE:PROACTIVE", `would chime in at ${channel} re: "${text.slice(0, 80)}"`);
      // TODO: wire up agentic loop with proactive trigger type
      return;
    }
  }
}
