import { chat } from "../../ai/client.js";
import { getThreadHistory, appendToThread } from "../../store/redis.js";
import { postMessage } from "../messages.js";

type DMEvent = {
  text?: string;
  user?: string;
  channel?: string;
  thread_ts?: string;
  ts?: string;
};

export async function handleDM(event: DMEvent): Promise<void> {
  const { text, user, channel, thread_ts, ts } = event;
  if (!text || !channel || !ts) return;

  // for DMs, use thread_ts if threaded, otherwise use ts as the conversation key
  const threadTs = thread_ts ?? ts;

  try {
    const history = await getThreadHistory(channel, threadTs);
    const response = await chat(text, history);

    await postMessage(channel, response, thread_ts ? threadTs : undefined);
    await appendToThread(channel, threadTs, text, response);
  } catch (err) {
    console.error("dm handler error:", err);
    await postMessage(channel, "kuch gadbad ho gayi, try again later");
  }
}
