import { quickCall } from "./client.js";
import { log } from "../log.js";

export type Classification = "ignore" | "observe" | "proactive";

const CLASSIFY_PROMPT = `you are classifying slack messages for a bot named "gabbar" / "gabbar singh". you will receive the message AND context about whether gabbar was already participating in the thread.

reply with ONLY one word:

- proactive: use this if ANY of these are true:
  * the message contains the word "gabbar" (not as @mention, just the name)
  * GABBAR_IN_THREAD is true — gabbar was already part of this thread and the conversation is continuing (someone replied, asked a follow-up, etc.)
  * someone directly replies to or references something gabbar said earlier

- observe: the message contains a technical decision, deployment, announcement, architecture discussion, or useful context worth silently remembering

- ignore: everything else. routine conversations, support tickets, bug reports, questions between coworkers, greetings, noise. this is the DEFAULT.

CRITICAL: if GABBAR_IN_THREAD is false and the message doesn't mention "gabbar" by name, it is almost always ignore or observe. gabbar does NOT jump into new conversations uninvited.`;

const IGNORE_PATTERNS = /^(ok|lol|lmao|haha|nice|thanks|ty|gg|cool|sure|yep|yea|yeah|nah|nope|:.*:|👍|👎|🎉|✅|❌|\+1|-1)$/i;
const SHORT_THRESHOLD = 3;

export async function classifyEvent(
  text: string,
  user?: string,
  gabbarInThread: boolean = false
): Promise<Classification> {
  if (!text || text.length < SHORT_THRESHOLD) return "ignore";
  if (IGNORE_PATTERNS.test(text.trim())) return "ignore";

  try {
    const contextLine = `GABBAR_IN_THREAD: ${gabbarInThread}`;
    const result = await quickCall(
      CLASSIFY_PROMPT,
      `${contextLine}\n[${user ?? "unknown"}] ${text}`
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
