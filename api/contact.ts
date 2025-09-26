import { VercelRequest, VercelResponse } from '@vercel/node';

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL!;
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET!;

const ALLOWED_ORIGINS = new Set([
  "https://heros20.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost",
]);

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = (req.headers.origin as string) || "";
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "https://heros20.github.io");
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Requested-With");
}

function bad(res: VercelResponse, code: number, message: string, extra?: any) {
  return res.status(code).json({ error: message, ...(extra || {}) });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return bad(res, 405, "Méthode non autorisée");

  // Parse JSON safe
  let body: any = req.body;
  if (!body || typeof body === "string") {
    try { body = body ? JSON.parse(body) : {}; } catch { return bad(res, 400, "Corps JSON invalide"); }
  }

  // Log minimal (supprime si tu veux)
  console.log("CONTACT body:", JSON.stringify(body).slice(0, 1000));

  const fieldErrors: Record<string, string> = {};
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const captcha = typeof body?.captcha === "string" ? body.captcha.trim() : "";

  if (!name) fieldErrors.name = "Manquant";
  else if (name.length < 2) fieldErrors.name = "Trop court";
  else if (name.length > 80) fieldErrors.name = "Trop long"; // (on élargit un peu)

  if (!email) fieldErrors.email = "Manquant";
  else if (email.length > 120) fieldErrors.email = "Trop long";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "Format invalide";

  if (!message) fieldErrors.message = "Manquant";
  else if (message.length < 6) fieldErrors.message = "Trop court";
  else if (message.length > 2000) fieldErrors.message = "Trop long"; // (on élargit un peu)

  if (!captcha) fieldErrors.captcha = "Manquant";

  if (Object.keys(fieldErrors).length) {
    return bad(res, 400, "Paramètres invalides", { fieldErrors });
  }

  // reCAPTCHA v3 verify
  try {
    const form = new URLSearchParams();
    form.set("secret", RECAPTCHA_SECRET);
    form.set("response", captcha);
    const captchaRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const captchaJson = await captchaRes.json();
    const ok = !!captchaJson?.success;
    const score = typeof captchaJson?.score === "number" ? captchaJson.score : 0;

    if (!ok || score < 0.5) {
      return bad(res, 403, "Captcha échec", { score, success: captchaJson?.success ?? false });
    }
  } catch {
    return bad(res, 500, "Erreur vérification Captcha");
  }

  const content = [
    "**Nouveau message du portfolio !**",
    `👤 **Nom** : ${sanitize(name)}`,
    `📧 **Email** : ${sanitize(email)}`,
    "💬 **Message** :",
    sanitize(message),
  ].join("\n");

  try {
    const r = await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!r.ok) return bad(res, 500, "Erreur Discord");
  } catch {
    return bad(res, 500, "Erreur envoi Discord");
  }

  return res.status(200).json({ success: true, message: "Message envoyé, merci !" });
}

function sanitize(str: string) {
  return String(str).replace(/[<>{}\[\]\$;]/g, "").trim();
}
