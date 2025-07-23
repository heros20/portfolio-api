import { VercelRequest, VercelResponse } from '@vercel/node';

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL!;
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { name, email, message, captcha } = req.body;

  // --- Validation basique ---
  if (
    !name || !email || !message || !captcha ||
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof message !== "string" ||
    typeof captcha !== "string" ||
    name.length < 2 || name.length > 40 ||
    email.length < 5 || email.length > 60 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    message.length < 6 || message.length > 600
  ) {
    return res.status(400).json({ error: "Paramètres invalides" });
  }

  // --- Vérif reCAPTCHA ---
  try {
    const captchaRes = await fetch(
      `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET}&response=${captcha}`,
      { method: "POST" }
    );
    const captchaJson = await captchaRes.json();
    if (!captchaJson.success || (typeof captchaJson.score === "number" && captchaJson.score < 0.5)) {
      return res.status(403).json({ error: "Captcha échec" });
    }
  } catch (e) {
    return res.status(500).json({ error: "Erreur vérification Captcha" });
  }

  // --- Formatage message Discord ---
  const content = `
**Nouveau message du portfolio !**
👤 **Nom** : ${sanitize(name)}
📧 **Email** : ${sanitize(email)}
💬 **Message** :
${sanitize(message)}
  `;

  // --- Envoi Discord ---
  try {
    const r = await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!r.ok) {
      return res.status(500).json({ error: "Erreur Discord" });
    }
  } catch (e) {
    return res.status(500).json({ error: "Erreur envoi Discord" });
  }

  return res.status(200).json({ success: true });
}

// Petite fonction de nettoyage
function sanitize(str: string) {
  return str.replace(/[<>{}[\]$;]/g, "").trim();
}
