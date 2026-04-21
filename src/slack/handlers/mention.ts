import { agenticLoop } from "../../ai/client.js";
import { buildSystemPrompt } from "../../ai/system-prompt.js";
import { getThreadHistory, appendToThread } from "../../store/redis.js";
import { postMessage, addReaction } from "../client.js";
import { getCoreMemory, formatCoreMemory } from "../../memory/core.js";
import { recallMemories } from "../../memory/episodic.js";
import { extractAndSaveMemories } from "../../memory/extract.js";
import { config } from "../../config.js";
import { log } from "../../log.js";

type MentionEvent = {
  text?: string;
  user?: string;
  channel?: string;
  channel_type?: string;
  thread_ts?: string;
  ts?: string;
};

function extractTags(text: string): string[] {
  // simple keyword extraction for memory retrieval
  const words = text.toLowerCase().split(/\s+/);
  return words
    .filter((w) => w.length > 3)
    .filter((w) => !["what", "when", "where", "which", "that", "this", "have", "been", "will", "from", "they", "their", "about", "would", "could", "should"].includes(w))
    .slice(0, 5);
}

export async function handleMention(event: MentionEvent): Promise<void> {
  const { text, user, channel, thread_ts, ts } = event;
  if (!text || !channel || !ts) return;

  const cleanText = text.replace(/<@[A-Z0-9]+>/g, "").trim();
  if (!cleanText) return;

  const threadTs = thread_ts ?? ts;

  try {
    await addReaction(channel, ts, "eyes");

    const [history, coreMemory, relevantMemories] = await Promise.all([
      getThreadHistory(channel, threadTs),
      getCoreMemory(),
      recallMemories(extractTags(cleanText)),
    ]);

    const ownerUserId = config.ownerUserId();
    const systemPrompt = buildSystemPrompt({
      coreMemory: formatCoreMemory(coreMemory),
      relevantMemories: relevantMemories.map((m) => m.fact),
      triggerType: "mention",
      meta: {
        sender: {
          userId: user,
          isOwner: user === ownerUserId,
          ownerUserId,
        },
        channel: { id: channel, type: event.channel_type },
        threadTs,
        messageTs: ts,
      },
    });

    log("MENTION", `user=${user} channel=${channel} memories=${relevantMemories.length} text="${cleanText.slice(0, 80)}"`);

    const response = await agenticLoop({
      systemPrompt,
      userMessage: cleanText,
      history,
      toolContext: {
        allowedChannels: [channel],
        isOwner: user === ownerUserId,
      },
    });

    await postMessage(channel, response, threadTs);
    await appendToThread(channel, threadTs, cleanText, response);

    // async memory extraction — don't await, fire and forget
    extractAndSaveMemories(cleanText, response, `${channel}:${threadTs}`).catch(
      (err) => log("MENTION:EXTRACT_ERR", err)
    );
  } catch (err) {
    log("MENTION:ERROR", err);
    await postMessage(channel, "kuch gadbad ho gayi, try again later", threadTs);
  }
}
