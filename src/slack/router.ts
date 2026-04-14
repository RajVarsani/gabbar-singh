import { handleMention } from "./handlers/mention.js";
import { handleDM } from "./handlers/dm.js";
import { handleObserve } from "./handlers/observe.js";
import { isDuplicate } from "../store/redis.js";
import { log } from "../log.js";

export type SlackEvent = {
  type: string;
  subtype?: string;
  event?: {
    type: string;
    subtype?: string;
    text?: string;
    user?: string;
    channel?: string;
    channel_type?: string;
    thread_ts?: string;
    ts?: string;
    bot_id?: string;
  };
  challenge?: string;
  event_id?: string;
};

export async function routeEvent(payload: SlackEvent): Promise<void> {
  const event = payload.event;
  if (!event) return;

  // ignore bot messages to prevent loops
  if (
    event.bot_id ||
    event.subtype === "bot_message" ||
    event.subtype === "message_changed"
  )
    return;

  // deduplicate slack retries
  if (payload.event_id && (await isDuplicate(payload.event_id))) return;

  switch (event.type) {
    case "app_mention":
      await handleMention(event);
      break;

    case "message":
      if (event.channel_type === "im") {
        await handleDM(event);
      } else if (
        event.channel_type === "channel" ||
        event.channel_type === "group"
      ) {
        await handleObserve(event);
      }
      break;

    default:
      log("ROUTER", `unhandled event type: ${event.type}`);
  }
}
