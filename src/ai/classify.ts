import { quickCall } from "./client.js";
import { log } from "../log.js";

export type Classification = "ignore" | "observe" | "react" | "proactive_check";

const CLASSIFY_PROMPT = `classify this slack message. reply with ONLY one word:
- ignore: noise, short reactions, status updates, greetings, already-handled
- observe: contains useful info worth remembering but no response needed
- react: worth a quick emoji reaction but no text response
- proactive_check: someone needs help, a question went unanswered, or something relevant to engineering work`;

// fast-path patterns that skip the AI call
const IGNORE_PATTERNS = /^(ok|lol|lmao|haha|nice|thanks|ty|gg|cool|sure|yep|yea|yeah|nah|nope|:.*:|👍|👎|🎉|✅|❌|\+1|-1)$/i;
const SHORT_THRESHOLD = 3;

export async function classifyEvent(
  text: string,
  user?: string
): Promise<Classification> {
  // fast-path: obvious noise
  if (!text || text.length < SHORT_THRESHOLD) return "ignore";
  if (IGNORE_PATTERNS.test(text.trim())) return "ignore";

  try {
    const result = await quickCall(
      CLASSIFY_PROMPT,
      `[${user ?? "unknown"}] ${text}`
    );

    const classification = result.trim().toLowerCase();
    if (
      ["ignore", "observe", "react", "proactive_check"].includes(
        classification
      )
    ) {
      return classification as Classification;
    }

    // default to ignore if unrecognized
    return "ignore";
  } catch (err) {
    log("CLASSIFY:ERROR", err);
    return "ignore"; // fail safe — don't act on errors
  }
}
