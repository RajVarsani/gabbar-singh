import { createHmac, timingSafeEqual } from "crypto";
import { config } from "../config.js";

const FIVE_MINUTES = 5 * 60;

export function verifySlackSignature(
  signature: string | null,
  timestamp: string | null,
  body: string
): boolean {
  if (!signature || !timestamp) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > FIVE_MINUTES) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = createHmac("sha256", config.slack.signingSecret());
  const mySignature = `v0=${hmac.update(sigBasestring).digest("hex")}`;

  return timingSafeEqual(
    Buffer.from(mySignature, "utf-8"),
    Buffer.from(signature, "utf-8")
  );
}
