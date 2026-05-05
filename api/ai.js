/**
 * api/ai.js — Proxy para Claude API (evita expor chave no frontend)
 * POST { messages: [...], system?: "..." }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages, system, max_tokens = 1500 } = req.body;
  if (!messages?.length) return res.status(400).json({ error: "No messages" });

  try {
    const body = {
      model: "claude-haiku-4-5-20251001",
      max_tokens,
      messages,
    };
    if (system) body.system = system;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      return res.status(response.status).json({ error: data.error || data });
    }

    res.status(200).json({ text: data.content?.[0]?.text || "" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
