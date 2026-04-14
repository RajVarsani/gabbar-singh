import { redisGet, redisSet } from "../store/redis.js";
import type { CoreMemory } from "./types.js";

const CORE_KEY = "gabbar:core";

const DEFAULT_CORE: CoreMemory = {
  users: {},
  workspace: {},
};

export async function getCoreMemory(): Promise<CoreMemory> {
  const data = await redisGet<CoreMemory>(CORE_KEY);
  return data ?? DEFAULT_CORE;
}

export async function updateCoreMemory(
  section: "users" | "workspace",
  key: string,
  value: string
): Promise<void> {
  const core = await getCoreMemory();

  if (section === "users") {
    const existing = core.users[key] ?? { name: key };
    core.users[key] = { ...existing, notes: value };
  } else {
    core.workspace[key] = value;
  }

  await redisSet(CORE_KEY, core);
}

export function formatCoreMemory(core: CoreMemory): string {
  const parts: string[] = [];

  const userEntries = Object.entries(core.users);
  if (userEntries.length > 0) {
    parts.push(
      "**people:**\n" +
        userEntries
          .map(([id, u]) => {
            const details = [u.name];
            if (u.role) details.push(u.role);
            if (u.notes) details.push(u.notes);
            return `- <@${id}>: ${details.join(" — ")}`;
          })
          .join("\n")
    );
  }

  const wsEntries = Object.entries(core.workspace);
  if (wsEntries.length > 0) {
    parts.push(
      "**workspace:**\n" +
        wsEntries.map(([k, v]) => `- ${k}: ${v}`).join("\n")
    );
  }

  return parts.join("\n\n") || "no core memories yet.";
}
