'use strict';

const nodemailer = require('nodemailer');

let transporter = null;

if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

const FROM = process.env.SMTP_FROM || 'Transit <no-reply@transit.app>';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(title, body) {
  return `<!doctype html>
<html lang="fr"><body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#14213d">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:#0b1f3a;border-radius:16px 16px 0 0;padding:20px 24px">
      <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:.04em">TRANSIT</div>
      <div style="color:#9fb3c8;font-size:13px">Ro-Ro &amp; conteneurs</div>
    </div>
    <div style="background:#ffffff;padding:28px 24px;border-radius:0 0 16px 16px;box-shadow:0 8px 24px rgba(11,31,58,.08)">
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.4">${escapeHtml(title)}</h1>
      ${body}
      <p style="margin:24px 0 0;font-size:12px;color:#5b6b82">Cet e-mail a été envoyé par l’application de transit. Si vous n’êtes pas à l’origine de cette demande, vous pouvez l’ignorer.</p>
    </div>
  </div>
</body></html>`;
}

async function sendMail(to, subject, html) {
  if (!to || !transporter) return false;
  try {
    await transporter.sendMail({ from: FROM, to, subject, html });
    return true;
  } catch (err) {
    console.error('Envoi e-mail échoué :', err.message);
    return false;
  }
}

async function sendQuoteConfirmation(quote) {
  if (!quote.contact.email) return false;
  const typeLabel = { roro: 'Ro-Ro', container: 'Conteneur', service: 'Autre service' }[quote.type] || quote.type;
  return sendMail(
    quote.contact.email,
    `Votre demande de cotation ${quote.number} est enregistrée`,
    layout(
      `Bonjour ${quote.contact.name},`,
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">Nous avons bien reçu votre demande de cotation <strong>${escapeHtml(quote.number)}</strong> (${escapeHtml(typeLabel)}).</p>
       <p style="margin:0 0 12px;font-size:15px;line-height:1.6">Notre équipe l’étudie et vous répondra par e-mail ou WhatsApp dès que possible.</p>
       <div style="background:#f4f7fb;border-left:4px solid #0e6ba8;border-radius:8px;padding:14px 16px;margin:18px 0;font-size:14px;line-height:1.6">
         <strong>Récapitulatif</strong><br>
         Demande : ${escapeHtml(quote.number)}<br>
         Type : ${escapeHtml(typeLabel)}<br>
         Statut : Reçue
       </div>`
    )
  );
}

async function sendQuoteResponse(quote) {
  if (!quote.contact.email || !quote.adminResponse) return false;
  return sendMail(
    quote.contact.email,
    `Réponse à votre demande de cotation ${quote.number}`,
    layout(
      `Bonjour ${quote.contact.name},`,
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">Votre demande <strong>${escapeHtml(quote.number)}</strong> a été traitée par notre équipe.</p>
       <div style="background:#f4f7fb;border-left:4px solid #f5a524;border-radius:8px;padding:14px 16px;margin:18px 0;font-size:14px;line-height:1.6">
         <strong>Prix proposé :</strong> ${escapeHtml(quote.adminResponse.price || 'Sur devis')}<br><br>
         ${escapeHtml(quote.adminResponse.message || '').replace(/\n/g, '<br>')}
       </div>
       <p style="margin:0;font-size:14px;color:#5b6b82">Connectez-vous à votre espace client pour suivre l’avancement de votre demande.</p>`
    )
  );
}

async function sendPasswordReset(user, resetUrl) {
  if (!user.email) return false;
  if (!transporter) {
    console.log(`🔗 Lien de réinitialisation (démo, SMTP non configuré) : ${resetUrl}`);
  }
  return sendMail(
    user.email,
    'Réinitialisation de votre mot de passe',
    layout(
      `Bonjour ${user.name},`,
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">Vous avez demandé la réinitialisation de votre mot de passe.</p>
       <p style="margin:24px 0;text-align:center"><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#0e6ba8;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600">Choisir un nouveau mot de passe</a></p>
       <p style="margin:0;font-size:13px;color:#5b6b82">Ce lien expire dans 1 heure. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.</p>`
    )
  );
}

async function sendNewQuoteAlert(quote) {
  if (!process.env.ADMIN_EMAIL) return false;
  const typeLabel = { roro: 'Ro-Ro', container: 'Conteneur', service: 'Autre service' }[quote.type] || quote.type;
  return sendMail(
    process.env.ADMIN_EMAIL,
    `Nouvelle demande de cotation ${quote.number}`,
    layout(
      `Nouvelle demande ${quote.number}`,
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.6"><strong>${escapeHtml(
        quote.contact.name
      )}</strong> a envoyé une demande ${escapeHtml(typeLabel)}.</p>
       <div style="background:#f4f7fb;border-left:4px solid #f5a524;border-radius:8px;padding:14px 16px;margin:18px 0;font-size:14px;line-height:1.6">
         Téléphone : ${escapeHtml(quote.contact.phone || '—')}<br>
         E-mail : ${escapeHtml(quote.contact.email || '—')}<br>
         Demande : ${escapeHtml(quote.number)}
       </div>
       <p style="margin:0;font-size:13px;color:#5b6b82">Connectez-vous à l’espace administrateur pour traiter cette demande.</p>`
    )
  );
}

module.exports = { sendMail, sendQuoteConfirmation, sendQuoteResponse, sendPasswordReset, sendNewQuoteAlert };
