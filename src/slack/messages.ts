import { WebClient } from "@slack/web-api";
import { config } from "../config.js";

let _slack: WebClient | null = null;

export function getSlack(): WebClient {
  if (!_slack) {
    _slack = new WebClient(config.slack.botToken());
  }
  return _slack;
}

export async function postMessage(
  channel: string,
  text: string,
  threadTs?: string
): Promise<void> {
  const slack = getSlack();
  await slack.chat.postMessage({
    channel,
    text,
    thread_ts: threadTs,
    unfurl_links: false,
    unfurl_media: false,
  });
}

export async function addReaction(
  channel: string,
  timestamp: string,
  emoji: string
): Promise<void> {
  const slack = getSlack();
  await slack.reactions.add({
    channel,
    timestamp,
    name: emoji,
  });
}
