import { VercelRequest, VercelResponse } from '@vercel/node';

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL!;
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET!;

// Whitelist CORS (ajoute d'autres origines si besoin)
const ALLOWED_ORIGINS = new Set([
  "https://heros20.github.io",        // Prod (GH Pages)
  "http://localhost:3000",            // Dev Next.js
  "http://localhost",                 // Dev
]);

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = (req.headers.origin as string) || "";
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    // Par défaut: refuse les origines non listées
    res.setHeader("Access-Control-Allow-Origin", "https://heros20.github.io");
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function bad(res: VercelResponse, code: number, message: string) {
  return res.status(code).json({ error: message });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    // Préflight CORS
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    return bad(res, 405, "Méthode non autorisée");
  }

  // --- Parse JSON body de manière sûre ---
  let body: any = req.body;
  if (!body || typeof body === "string") {
    try {
      body = body ? JSON.parse(body) : {};
    } catch {
      return bad(res, 400, "Corps JSON invalide");
    }
  }

  const { name, email, message, captcha } = body || {};

  // --- Validation basique ---
  if (
    !name || !email || !message || !captcha ||
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof message !== "string" ||
    typeof captcha !== "string"
  ) {
    return bad(res, 400, "Paramètres invalides");
  }

  if (
    name.trim().length < 2 || name.trim().length > 40 ||
    email.trim().length < 5 || email.trim().length > 60 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    message.trim().length < 6 || message.trim().length > 600
  ) {
    return bad(res, 400, "Paramètres invalides");
  }

  // --- Vérif reCAPTCHA v3 ---
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
      return bad(res, 403, "Captcha échec");
    }
  } catch (e) {
    return bad(res, 500, "Erreur vérification Captcha");
  }

  // --- Formatage message Discord ---
  const content = [
    "**Nouveau message du portfolio !**",
    `👤 **Nom** : ${sanitize(name)}`,
    `📧 **Email** : ${sanitize(email)}`,
    "💬 **Message** :",
    sanitize(message),
  ].join("\n");

  // --- Envoi Discord ---
  try {
    const r = await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!r.ok) {
      return bad(res, 500, "Erreur Discord");
    }
  } catch (e) {
    return bad(res, 500, "Erreur envoi Discord");
  }

  return res.status(200).json({ success: true, message: "Message envoyé, merci !" });
}

// Petite fonction de nettoyage
function sanitize(str: string) {
  return String(str).replace(/[<>{}\[\]\$;]/g, "").trim();
}
