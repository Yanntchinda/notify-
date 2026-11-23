// Fonction Supabase Edge — notifie l'administrateur à chaque nouvelle demande.
//
// Déclenchée par un webhook de base de données :
//   Database → Webhooks → INSERT sur public.quotes → URL de cette fonction
//
// Secrets à définir (Supabase → Edge Functions → Secrets) :
//   RESEND_API_KEY  clé API Resend (https://resend.com/api-keys)
//   ADMIN_EMAIL     adresse qui reçoit les demandes
//   APP_URL         adresse publique de l'application (pour le lien)
//   MAIL_FROM       expéditeur, ex. "Transit <devis@votre-domaine.com>"

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') ?? '';
const APP_URL = Deno.env.get('APP_URL') ?? '';
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? 'Transit Ro-Ro <onboarding@resend.dev>';

const LABELS: Record<string, string> = {
  roro: 'Ro-Ro',
  container: 'Conteneur',
  service: 'Autre service',
};

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

function summary(quote: Record<string, any>): string {
  const payload = quote.payload ?? {};
  const lines: string[] = [];
  if (quote.type === 'roro') {
    const vehicle = payload.vehicle ?? {};
    lines.push(`Véhicule : ${[vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(' ') || '—'}`);
    if (vehicle.vin) lines.push(`Châssis : ${vehicle.vin}`);
    if (payload.ship) lines.push(`Navire : ${payload.ship}`);
    lines.push(`Ports : ${payload.fromPortName ?? payload.fromPortId ?? '—'} → ${payload.toPortName ?? payload.toPortId ?? '—'}`);
  }
  if (quote.type === 'container') {
    lines.push(`Conteneur : ${payload.containerName ?? payload.containerId ?? '—'}`);
    lines.push(`Quantité : ${payload.quantity ?? 1}`);
    lines.push(`État : ${payload.condition === 'neuf' ? 'Neuf' : 'Occasion'}`);
  }
  if (quote.type === 'service') {
    lines.push(`Service : ${payload.serviceName ?? payload.serviceId ?? '—'}`);
  }
  if (payload.city) lines.push(`Ville de livraison : ${payload.city}${payload.country ? `, ${payload.country}` : ''}`);
  if (quote.distance?.km) {
    lines.push(`Distance jusqu'au port : ${quote.distance.km} km (${quote.distance.mode === 'road' ? 'route' : 'à vol d\'oiseau'})`);
  }
  return lines.map((line) => `<li>${esc(line)}</li>`).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const quote = body.record ?? body.quote ?? body;

    if (!quote || !quote.number) {
      return new Response(JSON.stringify({ ok: false, message: 'Demande introuvable' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contact = quote.contact ?? {};
    const label = LABELS[quote.type] ?? 'Demande';
    const link = `${APP_URL.replace(/\/$/, '')}/#/admin/quotes`;

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1c2b3a">
        <h2 style="color:#0b2b4f">Nouvelle demande ${esc(quote.number)}</h2>
        <p><strong>Type :</strong> ${esc(label)}</p>
        <p><strong>Client :</strong> ${esc(contact.name)}<br/>
           <strong>E-mail :</strong> ${esc(contact.email || '—')}<br/>
           <strong>Téléphone :</strong> ${esc(contact.phone || '—')}</p>
        <ul style="line-height:1.6">${summary(quote)}</ul>
        <p style="margin-top:24px">
          <a href="${esc(link)}" style="background:#0e6ba8;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none">
            Ouvrir la demande
          </a>
        </p>
        <p style="color:#6b7a8c;font-size:12px">Répondez directement à ce message pour écrire au client.</p>
      </div>`;

    const text = `Nouvelle demande ${quote.number} (${label})\nClient : ${contact.name}\nE-mail : ${contact.email}\nTéléphone : ${contact.phone}\nLien : ${link}`;

    if (!RESEND_API_KEY || !ADMIN_EMAIL) {
      return new Response(
        JSON.stringify({ ok: false, message: 'RESEND_API_KEY ou ADMIN_EMAIL manquant' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [ADMIN_EMAIL],
        reply_to: contact.email || undefined,
        subject: `Nouvelle demande ${quote.number} — ${contact.name}`,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return new Response(JSON.stringify({ ok: false, message: detail }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, message: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
