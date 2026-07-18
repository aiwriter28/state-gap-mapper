import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_request: VercelRequest, response: VercelResponse) {
  response.status(501).json({ error: "LLM extraction is not implemented yet." });
}
