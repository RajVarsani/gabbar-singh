import { handleMention } from "./handlers/mention.js";
import { handleDM } from "./handlers/dm.js";

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
  if (event.bot_id || event.subtype === "bot_message") return;

  switch (event.type) {
    case "app_mention":
      await handleMention(event);
      break;

    case "message":
      // only handle DMs (im = direct message channel)
      if (event.channel_type === "im") {
        await handleDM(event);
      }
      break;

    default:
      console.log(`unhandled event type: ${event.type}`);
  }
}
