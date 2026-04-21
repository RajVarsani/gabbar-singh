import { WebClient } from "@slack/web-api";
import { config } from "../config.js";
import { log } from "../log.js";

let _slack: WebClient | null = null;

export function getSlack(): WebClient {
  if (!_slack) {
    const token = config.slack.botToken();
    // gabbar must only have bot-scoped access. reject user tokens (xoxp-)
    // which would act on behalf of a real user and expose their private data.
    if (!token.startsWith("xoxb-")) {
      throw new Error(
        `SLACK_BOT_TOKEN must be a bot token (xoxb-). got prefix "${token.slice(0, 5)}" — refusing to start.`
      );
    }
    _slack = new WebClient(token);
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
  try {
    await slack.reactions.add({ channel, timestamp, name: emoji });
  } catch (err: any) {
    // ignore "already_reacted" errors
    if (err?.data?.error !== "already_reacted") throw err;
  }
}

export async function getChannelHistory(
  channel: string,
  limit: number = 20
): Promise<{ user: string; text: string; ts: string }[]> {
  const slack = getSlack();
  const result = await slack.conversations.history({
    channel,
    limit: Math.min(limit, 50),
  });

  return (result.messages ?? [])
    .filter((m) => m.user && m.text)
    .map((m) => ({
      user: m.user!,
      text: m.text!,
      ts: m.ts!,
    }));
}

export async function getThreadReplies(
  channel: string,
  threadTs: string
): Promise<{ user: string; text: string; ts: string }[]> {
  const slack = getSlack();
  const result = await slack.conversations.replies({
    channel,
    ts: threadTs,
    limit: 50,
  });

  return (result.messages ?? [])
    .filter((m) => m.user && m.text)
    .map((m) => ({
      user: m.user!,
      text: m.text!,
      ts: m.ts!,
    }));
}

export async function lookupUser(
  userId: string
): Promise<{ id: string; name: string; realName: string; title: string }> {
  const slack = getSlack();
  const result = await slack.users.info({ user: userId });
  const user = result.user!;
  return {
    id: user.id!,
    name: user.name ?? user.id!,
    realName: user.real_name ?? user.name ?? user.id!,
    title: user.profile?.title ?? "",
  };
}
