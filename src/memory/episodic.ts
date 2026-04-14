import {
  redisHset,
  redisHgetall,
  redisSadd,
  redisSunion,
  redisZadd,
  redisExpire,
} from "../store/redis.js";
import { log } from "../log.js";
import type { EpisodicMemory, ScoredMemory } from "./types.js";

const MEM_TTL = 60 * 60 * 24 * 30; // 30 days
const MAX_RETRIEVE = 5;

function generateId(): string {
  // simple time-sortable ID
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveMemory(
  fact: string,
  tags: string[],
  importance: number,
  source: string
): Promise<string> {
  const id = generateId();
  const memKey = `gabbar:mem:${id}`;
  const now = Date.now();

  await redisHset(memKey, {
    fact,
    tags: tags.join(","),
    importance,
    created: now,
    accessed: now,
    accessCount: 0,
    source,
  });
  await redisExpire(memKey, MEM_TTL);

  // add to tag indices
  for (const tag of tags) {
    const tagKey = `gabbar:tag:${tag.toLowerCase()}`;
    await redisSadd(tagKey, id);
    await redisExpire(tagKey, MEM_TTL);
  }

  // add to recency index
  await redisZadd("gabbar:mem:recent", now, id);

  log("MEMORY:SAVE", `id=${id} tags=[${tags.join(",")}] "${fact.slice(0, 60)}"`);
  return id;
}

export async function recallMemories(
  tags: string[],
  limit: number = MAX_RETRIEVE
): Promise<ScoredMemory[]> {
  if (tags.length === 0) return [];

  // get candidate memory IDs from tag union
  const tagKeys = tags.map((t) => `gabbar:tag:${t.toLowerCase()}`);
  let candidateIds: string[];

  try {
    candidateIds = await redisSunion(...tagKeys);
  } catch {
    candidateIds = [];
  }

  if (candidateIds.length === 0) return [];

  // fetch and score each candidate
  const now = Date.now();
  const scored: ScoredMemory[] = [];

  for (const id of candidateIds) {
    const raw = await redisHgetall(`gabbar:mem:${id}`);
    if (!raw || !raw.fact) continue;

    const mem: EpisodicMemory = {
      id,
      fact: raw.fact,
      tags: (raw.tags ?? "").split(","),
      importance: Number(raw.importance ?? 3),
      created: Number(raw.created ?? 0),
      accessed: Number(raw.accessed ?? 0),
      accessCount: Number(raw.accessCount ?? 0),
      source: raw.source ?? "",
    };

    // score: tag overlap * 3 + recency + access * 0.5 + importance * 2
    const tagOverlap = tags.filter((t) =>
      mem.tags.map((mt) => mt.toLowerCase()).includes(t.toLowerCase())
    ).length;
    const ageHours = (now - mem.created) / 3_600_000;
    const recencyScore = Math.max(0, 1 - ageHours / (24 * 30)); // decay over 30 days
    const accessBoost = Math.min(mem.accessCount / 10, 0.5);

    const score =
      tagOverlap * 3 + recencyScore + accessBoost + mem.importance * 2;

    scored.push({ ...mem, score });
  }

  // sort by score, take top N
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);

  // increment access count on retrieved memories
  for (const mem of top) {
    await redisHset(`gabbar:mem:${mem.id}`, {
      accessed: now,
      accessCount: mem.accessCount + 1,
    });
  }

  log("MEMORY:RECALL", `tags=[${tags.join(",")}] found=${scored.length} returned=${top.length}`);
  return top;
}
