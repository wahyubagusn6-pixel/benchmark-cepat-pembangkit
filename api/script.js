// api/script.js: writes the narration script for the explainer video of Benchmark Cepat.
// The page sends the prompt it built from the benchmark result; this function forwards it to Claude.
// Set ANTHROPIC_API_KEY in Vercel (Project > Settings > Environment Variables). Without it the page uses its rule-based script.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "Gunakan POST." }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(501).json({ error: "ANTHROPIC_API_KEY belum diatur di Vercel." }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const prompt = body && typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt || prompt.length > 60000) { res.status(400).json({ error: "Prompt kosong atau terlalu panjang." }); return; }
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 6000, messages: [{ role: "user", content: prompt }] }),
    });
    const j = await r.json();
    if (!r.ok) { res.status(502).json({ error: (j.error && j.error.message) || "Claude menolak permintaan." }); return; }
    const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
    res.status(200).json({ text, model: j.model });
  } catch (e) {
    res.status(502).json({ error: "Gagal menghubungi Claude: " + e.message });
  }
};
