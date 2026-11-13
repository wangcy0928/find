// Find — locate one named thing in a camera frame for a blind user.
// POST { image: dataURL, target: "door" }
//   -> { found, x, y, w, h, steps, label, note }   (x, y, w, h are 0-1 fractions of the frame)
// GET  -> { ok, hasKey }  (health check)
// Env: DEEPSEEK_API_KEY (required), DEEPSEEK_MODEL (optional, default deepseek-flash)

const PROMPT = (target) =>
  "You are the eyes of a blind person who is turning to find something. " +
  `They are looking for: "${target}". ` +
  "If that thing (or an obvious match, e.g. an EXIT sign for 'exit', a doorway for 'door') is visible in the photo, " +
  "even if small, far away, partly cut off at the edge, a bit blurry, or so close it fills the view, " +
  "reply with ONE line and nothing else, in this format:\n" +
  "x,y,w,h,steps,label\n" +
  "x,y = its centre as fractions of image width and height (0 = left/top, 1 = right/bottom). " +
  "w,h = its size as fractions of image width and height. " +
  "steps = walking distance in steps of 0.7 m, judged from its size (a door filling the height is 1-2 steps; half the height is 4-5). " +
  "label = 1-4 words naming exactly what you found.\n" +
  "Example: 0.72,0.45,0.20,0.60,4,glass door\n" +
  "If it is not visible, reply exactly: NO\n" +
  "If there are several, pick the nearest.";

function clamp01(v) { v = Number(v); return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null; }

function parse(text) {
  const t = String(text || "").trim();
  const m = t.match(/(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)?\s*,?\s*([^\n]*)/);
  if (m) return { found: true, x: m[1], y: m[2], w: m[3], h: m[4], steps: m[5], label: m[6].replace(/["'`.]/g, "").trim() };
  const j = t.match(/\{[\s\S]*\}/);          // tolerate a JSON answer too
  if (j) { try { return JSON.parse(j[0]); } catch {} }
  return { found: false };
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
    const t0 = Date.now();
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || "deepseek-flash",
        thinking: { type: "disabled" },
        max_tokens: 40,
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
    const found = !!j.found && x !== null && y !== null;
    const steps = Number(j.steps);
    return res.status(200).json({
      found,
      ms: Date.now() - t0,
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
