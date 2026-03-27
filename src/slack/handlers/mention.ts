import { chat } from "../../ai/client.js";
import { getThreadHistory, appendToThread } from "../../store/redis.js";
import { postMessage, addReaction } from "../messages.js";

type MentionEvent = {
  text?: string;
  user?: string;
  channel?: string;
  thread_ts?: string;
  ts?: string;
};

export async function handleMention(event: MentionEvent): Promise<void> {
  const { text, user, channel, thread_ts, ts } = event;
  if (!text || !channel || !ts) return;

  // strip the @mention from the text
  const cleanText = text.replace(/<@[A-Z0-9]+>/g, "").trim();
  if (!cleanText) return;

  // thread_ts: if this is already in a thread, use that; otherwise start a new thread from this message
  const threadTs = thread_ts ?? ts;

  try {
    // show thinking indicator
    await addReaction(channel, ts, "eyes");

    const history = await getThreadHistory(channel, threadTs);
    const response = await chat(cleanText, history);

    await postMessage(channel, response, threadTs);
    await appendToThread(channel, threadTs, cleanText, response);
  } catch (err) {
    console.error("mention handler error:", err);
    await postMessage(
      channel,
      "kuch gadbad ho gayi, try again later",
      threadTs
    );
  }
}
