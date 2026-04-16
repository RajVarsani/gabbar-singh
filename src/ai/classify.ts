import { quickCall } from "./client.js";
import { log } from "../log.js";

export type Classification = "ignore" | "observe" | "proactive";

const CLASSIFY_PROMPT = `you are classifying slack messages for a bot named "gabbar" / "gabbar singh". reply with ONLY one word:

- proactive: ONLY if the message literally contains the word "gabbar" (not as an @mention, just the word). nothing else qualifies.
- observe: the message contains a technical decision, announcement, deployment info, or useful context worth silently remembering for later
- ignore: everything else. this is the default. routine conversations, support tickets, questions between coworkers, incidents, bugs — all ignore unless gabbar is mentioned by name.

IMPORTANT: gabbar should NEVER insert himself into conversations he wasn't invited to. if someone is reporting a bug, asking for help, or having a discussion — that is NOT gabbar's business unless they said "gabbar". default to ignore.`;

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
    if (["ignore", "observe", "proactive"].includes(classification)) {
      return classification as Classification;
    }
    return "ignore";
  } catch (err) {
    log("CLASSIFY:ERROR", err);
    return "ignore";
  }
}
