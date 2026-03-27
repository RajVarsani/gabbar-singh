import { Redis } from "@upstash/redis";
import { config } from "../config.js";

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: config.redis.url(),
      token: config.redis.token(),
    });
  }
  return _redis;
}

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

const TTL = 60 * 60 * 24; // 24 hours
const MAX_HISTORY = 20; // keep last 20 messages per thread

function threadKey(channel: string, threadTs: string): string {
  return `gabbar:thread:${channel}:${threadTs}`;
}

export async function getThreadHistory(
  channel: string,
  threadTs: string
): Promise<ConversationMessage[]> {
  const redis = getRedis();
  const key = threadKey(channel, threadTs);
  const data = await redis.get<ConversationMessage[]>(key);
  return data ?? [];
}

export async function appendToThread(
  channel: string,
  threadTs: string,
  userMsg: string,
  assistantMsg: string
): Promise<void> {
  const redis = getRedis();
  const key = threadKey(channel, threadTs);

  const history = await getThreadHistory(channel, threadTs);
  history.push(
    { role: "user", content: userMsg },
    { role: "assistant", content: assistantMsg }
  );

  // keep only the last N messages
  const trimmed = history.slice(-MAX_HISTORY);
  await redis.set(key, trimmed, { ex: TTL });
}
