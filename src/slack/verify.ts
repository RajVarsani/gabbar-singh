import { createHmac, timingSafeEqual } from "crypto";
import { config } from "../config.js";

const FIVE_MINUTES = 5 * 60;

export function verifySlackSignature(
  signature: string | null,
  timestamp: string | null,
  body: string
): boolean {
  if (!signature || !timestamp) return false;

  // reject non-numeric timestamps + replay attacks older than 5min
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > FIVE_MINUTES) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = createHmac("sha256", config.slack.signingSecret());
  const mySignature = `v0=${hmac.update(sigBasestring).digest("hex")}`;

  const a = Buffer.from(mySignature, "utf-8");
  const b = Buffer.from(signature, "utf-8");
  // timingSafeEqual throws on length mismatch — guard first
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
