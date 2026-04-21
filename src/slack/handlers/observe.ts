import { classifyEvent } from "../../ai/classify.js";
import { agenticLoop, quickCall } from "../../ai/client.js";
import { buildSystemPrompt } from "../../ai/system-prompt.js";
import { saveMemory } from "../../memory/episodic.js";
import { getCoreMemory, formatCoreMemory } from "../../memory/core.js";
import { recallMemories } from "../../memory/episodic.js";
import { postMessage } from "../client.js";
import {
  redisGet,
  redisSet,
  getThreadHistory,
  appendToThread,
} from "../../store/redis.js";
import { config } from "../../config.js";
import { log } from "../../log.js";

type ChannelEvent = {
  text?: string;
  user?: string;
  channel?: string;
  channel_type?: string;
  thread_ts?: string;
  ts?: string;
};

const EXTRACT_PROMPT = `extract one factual memory from this slack message. respond with JSON (no markdown):
{"fact": "...", "tags": ["tag1", "tag2"]}
if nothing worth remembering, respond with: null`;

const PROACTIVE_COOLDOWN = 300; // 5 minutes

function extractTags(text: string): string[] {
  const words = text.toLowerCase().split(/\s+/);
  return words
    .filter((w) => w.length > 3)
    .filter(
      (w) =>
        ![
          "what", "when", "where", "which", "that", "this",
          "have", "been", "will", "from", "they", "their",
          "about", "would", "could", "should",
        ].includes(w)
    )
    .slice(0, 5);
}

// rate limits (sliding-window counters in Redis). non-owner senders burn
// classification + potentially memory-extract budget on every message — cap it.
const CLASSIFY_RATE_WINDOW = 3600; // 1 hour
const CLASSIFY_RATE_LIMIT_OWNER = 500;
const CLASSIFY_RATE_LIMIT_OTHER = 30;

async function shouldClassify(user: string | undefined, isOwner: boolean): Promise<boolean> {
  if (!user) return false;
  const key = `gabbar:classify_rate:${user}`;
  const count = (await redisGet<number>(key)) ?? 0;
  const limit = isOwner ? CLASSIFY_RATE_LIMIT_OWNER : CLASSIFY_RATE_LIMIT_OTHER;
  if (count >= limit) {
    log("OBSERVE:RATE_LIMIT", `user=${user} count=${count} limit=${limit}`);
    return false;
  }
  await redisSet(key, count + 1, CLASSIFY_RATE_WINDOW);
  return true;
}

export async function handleObserve(event: ChannelEvent): Promise<void> {
  const { text, user, channel, thread_ts, ts } = event;
  if (!text || !channel || !ts) return;

  const ownerUserId = config.ownerUserId();
  const isOwner = user === ownerUserId;

  // cap classification calls per-user to prevent api cost abuse
  if (!(await shouldClassify(user, isOwner))) return;

  // check if gabbar already participated in this thread
  const threadTs = thread_ts ?? ts;
  const threadHistory = await getThreadHistory(channel, threadTs);
  const gabbarInThread = threadHistory.length > 0;

  const classification = await classifyEvent(text, user, gabbarInThread);
  log(
    "OBSERVE",
    `classification=${classification} isOwner=${isOwner} inThread=${gabbarInThread} channel=${channel} user=${user} text="${text.slice(0, 60)}"`
  );

  switch (classification) {
    case "ignore":
      return;

    case "observe": {
      // only save memories from owner — non-owner messages could be
      // prompt-injection attempts to poison memory
      if (!isOwner) {
        log("OBSERVE:SKIP_SAVE", `non-owner message, not saving memory (user=${user})`);
        return;
      }
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
      return;
    }

    case "proactive": {
      // hard authorization gate — only owner can trigger proactive responses.
      // even if someone says "gabbar" in a channel, gabbar only responds to raj.
      if (!isOwner) {
        log(
          "OBSERVE:AUTH",
          `blocked proactive response to non-owner ${user} in ${channel}`
        );
        return;
      }

      // rate limit — but skip cooldown if gabbar is already in the thread
      if (!gabbarInThread) {
        const cooldownKey = `gabbar:cooldown:${channel}`;
        const existing = await redisGet<number>(cooldownKey);
        if (existing) {
          log("OBSERVE", `proactive skipped — cooldown active for ${channel}`);
          return;
        }
        await redisSet(cooldownKey, 1, PROACTIVE_COOLDOWN);
      }

      try {
        const [coreMemory, relevantMemories] = await Promise.all([
          getCoreMemory(),
          recallMemories(extractTags(text)),
        ]);

        const systemPrompt = buildSystemPrompt({
          coreMemory: formatCoreMemory(coreMemory),
          relevantMemories: relevantMemories.map((m) => m.fact),
          triggerType: gabbarInThread ? "mention" : "proactive",
          meta: {
            sender: {
              userId: user,
              isOwner: true,
              ownerUserId,
            },
            channel: { id: channel, type: event.channel_type },
            threadTs,
            messageTs: ts,
          },
        });

        log(
          "OBSERVE:PROACTIVE",
          `inThread=${gabbarInThread} channel=${channel} text="${text.slice(0, 80)}"`
        );

        const response = await agenticLoop({
          systemPrompt,
          userMessage: text,
          history: gabbarInThread ? threadHistory : [],
          maxIterations: gabbarInThread ? 10 : 5,
          timeBudgetMs: gabbarInThread ? 50_000 : 30_000,
          toolContext: {
            allowedChannels: [channel],
            isOwner: true,
          },
        });

        if (response && response.length > 0) {
          await postMessage(channel, response, threadTs);
          await appendToThread(channel, threadTs, text, response);
        }
      } catch (err) {
        log("OBSERVE:PROACTIVE_ERR", err);
      }
      return;
    }
  }
}
