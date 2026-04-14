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
const DEDUP_TTL = 60; // 60 seconds dedup window

// returns true if this event was already seen (duplicate)
export async function isDuplicate(eventId: string): Promise<boolean> {
  const redis = getRedis();
  const key = `gabbar:dedup:${eventId}`;
  // SET NX returns null if key already exists
  const result = await redis.set(key, 1, { ex: DEDUP_TTL, nx: true });
  return result === null;
}

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

// --- generic redis operations for memory system ---

export async function redisGet<T>(key: string): Promise<T | null> {
  return getRedis().get<T>(key);
}

export async function redisSet(
  key: string,
  value: any,
  ttlSeconds?: number
): Promise<void> {
  const redis = getRedis();
  if (ttlSeconds) {
    await redis.set(key, value, { ex: ttlSeconds });
  } else {
    await redis.set(key, value);
  }
}

export async function redisHset(
  key: string,
  fields: Record<string, string | number>
): Promise<void> {
  const redis = getRedis();
  await redis.hset(key, fields);
}

export async function redisHgetall(
  key: string
): Promise<Record<string, string> | null> {
  const redis = getRedis();
  return redis.hgetall(key);
}

export async function redisSadd(key: string, ...members: string[]): Promise<void> {
  const redis = getRedis();
  for (const member of members) {
    await redis.sadd(key, member);
  }
}

export async function redisSmembers(key: string): Promise<string[]> {
  const redis = getRedis();
  const result = await redis.smembers(key);
  return result as string[];
}

export async function redisSunion(...keys: string[]): Promise<string[]> {
  const redis = getRedis();
  // upstash sunion takes individual args, not spread
  const result = await redis.sunion(...(keys as [string, ...string[]]));
  return result as string[];
}

export async function redisZadd(
  key: string,
  score: number,
  member: string
): Promise<void> {
  const redis = getRedis();
  await redis.zadd(key, { score, member });
}

export async function redisExpire(key: string, seconds: number): Promise<void> {
  const redis = getRedis();
  await redis.expire(key, seconds);
}
