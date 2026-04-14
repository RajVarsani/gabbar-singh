import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({
    status: "ok",
    name: "gabbar-singh",
    timestamp: new Date().toISOString(),
  });
}
