// Find — locate one named thing in a camera frame for a blind user.
// POST { image: dataURL, target: "door" }
//   -> { found, x, y, w, h, steps, label, note }   (x, y, w, h are 0-1 fractions of the frame)
// GET  -> { ok, hasKey }  (health check)
// Env: DEEPSEEK_API_KEY (required), DEEPSEEK_MODEL (optional, default deepseek-flash)

const PROMPT = (target) =>
  "You are the eyes of a blind person who is turning slowly to find something. " +
  `They are looking for: "${target}". ` +
  "Look at the photo and answer with ONE JSON object and nothing else:\n" +
  '{"found": true|false, "conf": 0-1, "x": 0-1, "y": 0-1, "w": 0-1, "h": 0-1, "steps": number|null, "label": "...", "note": "..."}\n' +
  "- found: true if that thing (or an obvious match, e.g. an EXIT sign for 'exit', a doorway for 'door') is visible, " +
  "even if small, far away, partly cut off at the edge, slightly blurry, or so close it fills most of the view.\n" +
  "- conf: how sure you are it is the right thing (0-1).\n" +
  "- x, y: centre of the thing as a fraction of image width / height (0 = left/top, 1 = right/bottom).\n" +
  "- w, h: its size as a fraction of image width / height.\n" +
  "- steps: walking distance in normal steps (1 step = 0.7 m). Judge from its size in the image (a door filling the height is 1-2 steps; a door half the image height is about 4-5 steps). Never null if found.\n" +
  "- label: 1-4 words naming exactly what you found, e.g. \"glass door\", \"EXIT sign\", \"Room 706 door\".\n" +
  "- note: at most 8 words that matter for reaching it (\"two steps down first\", \"door is closed\"), or \"\".\n" +
  "If it is not visible, return {\"found\": false, \"note\": \"\"}. If there are several, pick the nearest.";

function clamp01(v) { v = Number(v); return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null; }

function parse(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, hasKey: !!process.env.DEEPSEEK_API_KEY });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return res.status(500).json({ error: "DEEPSEEK_API_KEY is not set" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const image = body.image;
  const target = String(body.target || "").trim().slice(0, 60);
  if (!image || !String(image).startsWith("data:image/")) {
    return res.status(400).json({ error: "image (data URL) is required" });
  }
  if (!target) return res.status(400).json({ error: "target is required" });

  try {
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || "deepseek-flash",
        thinking: { type: "disabled" },
        max_tokens: 120,
        temperature: 0.1,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: PROMPT(target) },
            { type: "image_url", image_url: { url: image } }
          ]
        }]
      })
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(502).json({ error: (data.error && data.error.message) || "DeepSeek error " + r.status });
    }
    const raw = data.choices && data.choices[0] && data.choices[0].message.content;
    const j = parse(raw) || {};
    const x = clamp01(j.x), y = clamp01(j.y);
    const conf = Number.isFinite(Number(j.conf)) ? Number(j.conf) : (j.found ? .6 : 0);
    const found = !!j.found && conf >= .35 && x !== null && y !== null;
    const steps = Number(j.steps);
    return res.status(200).json({
      found,
      conf: Math.round(conf * 100) / 100,
      x: found ? x : null,
      y: found ? y : null,
      w: found ? clamp01(j.w) : null,
      h: found ? clamp01(j.h) : null,
      steps: found && Number.isFinite(steps) && steps > 0 ? Math.round(steps) : null,
      label: found ? String(j.label || target).slice(0, 40) : "",
      note: String(j.note || "").slice(0, 80)
    });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
};
