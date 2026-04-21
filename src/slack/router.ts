import { handleMention } from "./handlers/mention.js";
import { handleDM } from "./handlers/dm.js";
import { handleObserve } from "./handlers/observe.js";
import { isDuplicate } from "../store/redis.js";
import { config } from "../config.js";
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

  const ownerUserId = config.ownerUserId();
  const isOwner = event.user === ownerUserId;

  switch (event.type) {
    case "app_mention":
      // only owner can trigger responses via mention
      if (!isOwner) {
        log("ROUTER:AUTH", `blocked mention from non-owner ${event.user}`);
        return;
      }
      await handleMention(event);
      break;

    case "message":
      if (event.channel_type === "im") {
        // DMs: only owner can talk to gabbar. silently drop others.
        if (!isOwner) {
          log("ROUTER:AUTH", `blocked DM from non-owner ${event.user}`);
          return;
        }
        await handleDM(event);
      } else if (
        event.channel_type === "channel" ||
        event.channel_type === "group"
      ) {
        // observe path is allowed for everyone (passive memory),
        // but the handler will gate proactive responses to owner only
        await handleObserve(event);
      }
      break;

    default:
      log("ROUTER", `unhandled event type: ${event.type}`);
  }
}
