import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifySlackSignature } from "../../src/slack/verify.js";
import { routeEvent } from "../../src/slack/router.js";
import type { SlackEvent } from "../../src/slack/router.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  const rawBody =
    typeof req.body === "string" ? req.body : JSON.stringify(req.body);

  // verify signature
  const isValid = verifySlackSignature(
    req.headers["x-slack-signature"] as string,
    req.headers["x-slack-request-timestamp"] as string,
    rawBody
  );

  if (!isValid) {
    return res.status(401).json({ error: "invalid signature" });
  }

  const payload: SlackEvent =
    typeof req.body === "string" ? JSON.parse(req.body) : req.body;

  // handle slack url verification challenge
  if (payload.type === "url_verification") {
    return res.status(200).json({ challenge: payload.challenge });
  }

  // acknowledge immediately, process async
  // Vercel's waitUntil keeps the function alive after response
  if (payload.type === "event_callback" && payload.event) {
    // use waitUntil if available (Vercel), otherwise fire-and-forget
    const processing = routeEvent(payload).catch((err) =>
      console.error("event processing error:", err)
    );

    if (typeof globalThis !== "undefined" && "waitUntil" in globalThis) {
      (globalThis as any).waitUntil(processing);
    }
  }

  return res.status(200).json({ ok: true });
}
