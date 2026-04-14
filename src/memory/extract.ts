import { quickCall } from "../ai/client.js";
import { saveMemory } from "./episodic.js";
import { log } from "../log.js";

const EXTRACTION_PROMPT = `you are a memory extraction system. given a conversation between a user and gabbar singh (an AI assistant), extract facts worth remembering for future conversations.

rules:
- only extract facts that are DURABLE (likely true across future conversations)
- only extract facts that would CHANGE how gabbar responds to this user
- focus on: preferences, roles, projects, relationships, recurring topics
- do NOT extract: greetings, small talk, one-time questions, system info
- importance: 1=nice to know, 3=useful, 5=critical to remember

respond with a JSON array (no markdown, no explanation):
[{"fact": "...", "tags": ["tag1", "tag2"], "importance": 3}]

if nothing worth remembering, respond with: []`;

type ExtractedMemory = {
  fact: string;
  tags: string[];
  importance: number;
};

export async function extractAndSaveMemories(
  userMessage: string,
  assistantResponse: string,
  source: string
): Promise<void> {
  try {
    const transcript = `User: ${userMessage}\nGabbar: ${assistantResponse}`;
    const result = await quickCall(EXTRACTION_PROMPT, transcript);

    // parse JSON — handle potential markdown wrapping
    const cleaned = result.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    if (!cleaned || cleaned === "[]") return;

    const memories: ExtractedMemory[] = JSON.parse(cleaned);

    for (const mem of memories) {
      if (mem.importance >= 3 && mem.fact && mem.tags?.length > 0) {
        await saveMemory(mem.fact, mem.tags, mem.importance, source);
      }
    }

    log("EXTRACT", `saved ${memories.filter((m) => m.importance >= 3).length} memories from conversation`);
  } catch (err) {
    // extraction failure is non-critical — don't break the main flow
    log("EXTRACT:ERROR", err);
  }
}
