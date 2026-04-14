import { quickCall } from "./client.js";
import { log } from "../log.js";

export type Classification = "ignore" | "observe";

const CLASSIFY_PROMPT = `classify this slack message. reply with ONLY one word:
- ignore: noise, short reactions, greetings, status updates, questions directed at specific people, routine messages
- observe: contains genuinely useful technical info, decisions, announcements, or context worth remembering for later`;

const IGNORE_PATTERNS = /^(ok|lol|lmao|haha|nice|thanks|ty|gg|cool|sure|yep|yea|yeah|nah|nope|:.*:|👍|👎|🎉|✅|❌|\+1|-1)$/i;
const SHORT_THRESHOLD = 3;

export async function classifyEvent(
  text: string,
  user?: string
): Promise<Classification> {
  if (!text || text.length < SHORT_THRESHOLD) return "ignore";
  if (IGNORE_PATTERNS.test(text.trim())) return "ignore";

  try {
    const result = await quickCall(
      CLASSIFY_PROMPT,
      `[${user ?? "unknown"}] ${text}`
    );

    const classification = result.trim().toLowerCase();
    if (classification === "observe") return "observe";
    return "ignore";
  } catch (err) {
    log("CLASSIFY:ERROR", err);
    return "ignore";
  }
}
