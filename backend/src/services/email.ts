const { sendMail } = require('./mailer');

// Escapa datos provenientes de clientes antes de inyectarlos en el HTML del email
function esc(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}


export async function sendWelcomeEmail(opts: { to: string; businessName: string }) {
  const dashboardUrl = 'https://automation-ai-dashboard.vercel.app';
  const html = `
    <div style="font-family:sans-serif;max-width:540px;margin:0 auto;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:linear-gradient(135deg,#7c3aed,#2563eb);padding:28px;">
        <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800;">Bienvenido a Wasso 🚀</h1>
        <p style="color:#ddd6fe;margin:6px 0 0;font-size:14px;">Tu prueba gratuita de 7 días ya está activa</p>
      </div>
      <div style="padding:28px;">
        <p style="font-size:15px;color:#111827;margin:0 0 20px;">Hola <strong>${esc(opts.businessName)}</strong>, tu cuenta está lista. Empecemos:</p>
        <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:20px;margin-bottom:20px;">
          <p style="font-size:13px;font-weight:700;color:#7c3aed;margin:0 0 12px;text-transform:uppercase;letter-spacing:.05em;">Paso 1 — Configurá tu bot</p>
          <p style="font-size:14px;color:#374151;margin:0 0 12px;">Ingresá al dashboard y completá la información de tu negocio: nombre, servicios, precios y horarios. Cuanto más completo, mejor responde tu bot.</p>
          <a href="${dashboardUrl}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Ir al dashboard →</a>
        </div>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin-bottom:20px;">
          <p style="font-size:13px;font-weight:700;color:#059669;margin:0 0 12px;text-transform:uppercase;letter-spacing:.05em;">Paso 2 — Activamos tu WhatsApp</p>
          <p style="font-size:14px;color:#374151;margin:0;">Coordinamos con vos la activación de tu número de WhatsApp para que el bot empiece a atender a tus clientes. Te contactamos para dejarlo andando.</p>
        </div>
        <p style="font-size:13px;color:#6b7280;margin:0;">¿Tenés dudas? Respondé este email y te ayudamos.</p>
      </div>
      <div style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
        Wasso · Tu asistente de WhatsApp con IA
      </div>
    </div>`;
  await sendMail({
    to: opts.to,
    subject: `🚀 Bienvenido a Wasso — empezá tu prueba gratis`,
    html,
  });
}

export async function sendCancellationEmail(opts: {
  to: string;
  businessName: string;
  botName: string;
  clientPhone: string;
  clientName: string;
  appointmentDate: string;
  appointmentTime: string;
  title: string;
}) {
  if (!opts.to) return;

  const dashboardUrl = 'https://automation-ai-dashboard.vercel.app';
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#dc2626;padding:24px 28px;">
        <h2 style="color:#fff;margin:0;font-size:18px;">❌ Turno cancelado</h2>
        <p style="color:#fecaca;margin:4px 0 0;font-size:13px;">${esc(opts.businessName)} · ${esc(opts.botName)}</p>
      </div>
      <div style="padding:24px 28px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
          <tr><td style="padding:8px 0;color:#6b7280;width:140px;">Cliente</td><td style="padding:8px 0;font-weight:600;">${esc(opts.clientName)} (${esc(opts.clientPhone)})</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Servicio</td><td style="padding:8px 0;">${esc(opts.title)}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Fecha</td><td style="padding:8px 0;">${esc(opts.appointmentDate)} a las ${esc(opts.appointmentTime)}</td></tr>
        </table>
        <p style="font-size:13px;color:#6b7280;">El cliente canceló automáticamente. El horario quedó disponible.</p>
        <a href="${dashboardUrl}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
          Ver en el dashboard →
        </a>
      </div>
      <div style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
        Wasso · Sistema automático de atención por WhatsApp
      </div>
    </div>`;

  await sendMail({
    to: opts.to,
    subject: `❌ Turno cancelado — ${esc(opts.clientName)} (${opts.appointmentDate})`,
    html,
  });
}

export async function sendEscalationEmail(opts: {
  to: string;
  businessName: string;
  botName: string;
  clientPhone: string;
  reason: 'keyword' | 'limit';
  keyword?: string;
}) {
  if (!opts.to) return;

  const subject = `🔔 ${opts.botName} necesita tu atención — ${opts.businessName}`;
  const reasonText = opts.reason === 'keyword'
    ? `El cliente mencionó una palabra clave de escalación${opts.keyword ? ` ("${esc(opts.keyword)}")` : ''}.`
    : `Se alcanzó el límite de mensajes automáticos.`;

  const dashboardUrl = 'https://automation-ai-dashboard.vercel.app';

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#7c3aed;padding:24px 28px;">
        <h2 style="color:#fff;margin:0;font-size:18px;">🔔 Conversación escalada</h2>
        <p style="color:#ddd6fe;margin:4px 0 0;font-size:13px;">${esc(opts.businessName)} · ${esc(opts.botName)}</p>
      </div>
      <div style="padding:24px 28px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
          <tr><td style="padding:8px 0;color:#6b7280;width:140px;">Motivo</td><td style="padding:8px 0;font-weight:600;">${reasonText}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Teléfono cliente</td><td style="padding:8px 0;">${esc(opts.clientPhone)}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Negocio</td><td style="padding:8px 0;">${esc(opts.businessName)}</td></tr>
        </table>
        <a href="${dashboardUrl}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
          Ver conversación en el dashboard →
        </a>
      </div>
      <div style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
        Wasso · Sistema automático de atención por WhatsApp
      </div>
    </div>`;

  await sendMail({
    to: opts.to,
    subject,
    html,
  });
}
