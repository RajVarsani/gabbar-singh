function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  slack: {
    botToken: () => required("SLACK_BOT_TOKEN"),
    signingSecret: () => required("SLACK_SIGNING_SECRET"),
  },
  anthropic: {
    apiKey: () => required("ANTHROPIC_API_KEY"),
  },
  redis: {
    url: () => required("UPSTASH_REDIS_REST_URL"),
    token: () => required("UPSTASH_REDIS_REST_TOKEN"),
  },
  ownerUserId: () => process.env.OWNER_USER_ID ?? "U08SXQF8RTQ",
} as const;
