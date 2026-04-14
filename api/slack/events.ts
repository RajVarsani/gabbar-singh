import type { VercelRequest, VercelResponse } from "@vercel/node";
import { waitUntil } from "@vercel/functions";
import { verifySlackSignature } from "../../src/slack/verify.js";
import { routeEvent } from "../../src/slack/router.js";
import type { SlackEvent } from "../../src/slack/router.js";

export const config = {
  api: { bodyParser: false },
};

async function getRawBody(req: VercelRequest): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  const rawBody = await getRawBody(req);
  const payload: SlackEvent = JSON.parse(rawBody);

  // handle slack url verification challenge (before sig check)
  if (payload.type === "url_verification") {
    return res.status(200).json({ challenge: payload.challenge });
  }

  // skip slack retries
  const retryNum = req.headers["x-slack-retry-num"];
  if (retryNum) {
    return res.status(200).json({ ok: true, skipped: "retry" });
  }

  // verify signature
  const isValid = verifySlackSignature(
    req.headers["x-slack-signature"] as string,
    req.headers["x-slack-request-timestamp"] as string,
    rawBody
  );

  if (!isValid) {
    return res.status(401).json({ error: "invalid signature" });
  }

  // acknowledge immediately, process async via waitUntil
  if (payload.type === "event_callback" && payload.event) {
    waitUntil(
      routeEvent(payload).catch((err) =>
        console.error("event processing error:", err)
      )
    );
  }

  return res.status(200).json({ ok: true });
}
