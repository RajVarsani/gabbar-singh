import { quickCall } from "./client.js";
import { log } from "../log.js";

export type Classification = "ignore" | "observe" | "react" | "proactive";

const CLASSIFY_PROMPT = `you are classifying slack messages for an AI bot named "gabbar" (also called "gabbar singh"). reply with ONLY one word:

- ignore: routine messages, greetings, status updates, questions directed at specific people, conversations gabbar has no business in
- observe: contains useful technical info, decisions, or context worth silently remembering
- react: ONLY if the message is funny/celebratory AND relevant to gabbar or the team (not random work requests between other people)
- proactive: ONLY use this if ONE of these is true:
  * someone mentions "gabbar" by name (not @mention, just the word)
  * gabbar was part of an earlier conversation in the same thread and the discussion continues
  * someone asks a question that went unanswered for a while and gabbar can genuinely help
  * there's an incident/outage/error that gabbar should flag

DEFAULT TO IGNORE. when in doubt, ignore. gabbar should NOT insert himself into other people's conversations.`;

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
    if (
      ["ignore", "observe", "react", "proactive"].includes(classification)
    ) {
      return classification as Classification;
    }
    return "ignore";
  } catch (err) {
    log("CLASSIFY:ERROR", err);
    return "ignore";
  }
}
