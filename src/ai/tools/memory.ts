import type Anthropic from "@anthropic-ai/sdk";
import { saveMemory, recallMemories } from "../../memory/episodic.js";
import { updateCoreMemory } from "../../memory/core.js";
import { log } from "../../log.js";

export const memoryTools: Anthropic.Tool[] = [
  {
    name: "save_memories",
    description:
      "Save important facts from this conversation for future reference. Use when you learn something durable about a user, project, or preference.",
    input_schema: {
      type: "object" as const,
      properties: {
        memories: {
          type: "array",
          items: {
            type: "object",
            properties: {
              fact: {
                type: "string",
                description: "The fact to remember (1-2 sentences)",
              },
              tags: {
                type: "array",
                items: { type: "string" },
                description: "1-3 short category tags for retrieval",
              },
              importance: {
                type: "number",
                description: "1-5 scale (3=useful, 5=critical)",
              },
            },
            required: ["fact", "tags", "importance"],
          },
        },
      },
      required: ["memories"],
    },
  },
  {
    name: "recall_memories",
    description:
      "Search your memory for relevant facts about a topic, person, or project. Use when you need context you might have stored earlier.",
    input_schema: {
      type: "object" as const,
      properties: {
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags to search for",
        },
      },
      required: ["tags"],
    },
  },
  {
    name: "update_core_memory",
    description:
      "Update persistent core facts about users or the workspace. Use sparingly — only for important, stable facts that should always be in context.",
    input_schema: {
      type: "object" as const,
      properties: {
        section: {
          type: "string",
          enum: ["users", "workspace"],
          description: "Which section to update",
        },
        key: {
          type: "string",
          description: "User ID or fact key",
        },
        value: {
          type: "string",
          description: "The information to store",
        },
      },
      required: ["section", "key", "value"],
    },
  },
];

export async function executeMemoryTool(
  name: string,
  input: Record<string, any>
): Promise<string> {
  log("TOOL:MEMORY", `${name}`, JSON.stringify(input));

  switch (name) {
    case "save_memories": {
      const saved: string[] = [];
      for (const mem of input.memories ?? []) {
        const id = await saveMemory(
          mem.fact,
          mem.tags,
          mem.importance,
          "tool_call"
        );
        saved.push(id);
      }
      return `saved ${saved.length} memories`;
    }
    case "recall_memories": {
      const memories = await recallMemories(input.tags ?? []);
      if (memories.length === 0) return "no relevant memories found";
      return memories.map((m) => `- [${m.tags.join(",")}] ${m.fact}`).join("\n");
    }
    case "update_core_memory": {
      await updateCoreMemory(input.section, input.key, input.value);
      return `core memory updated: ${input.section}.${input.key}`;
    }
    default:
      return `unknown memory tool: ${name}`;
  }
}
