import { C, FONT, esc, shell, header, footer, button, detailRows, callout, DASHBOARD_URL } from './emailTheme';
const { sendMail } = require('./mailer');

export async function sendWelcomeEmail(opts: { to: string; businessName: string }) {
  const html = shell({
    title: 'Bienvenido a Wasso',
    preheader: 'Tu prueba gratuita de 7 días ya está activa. Configurá tu bot en dos pasos.',
    body: `
      ${header('Bienvenido a Wasso', 'Tu prueba gratuita de 7 días ya está activa')}
      <tr><td style="padding:26px 24px 0;">
        <div style="font-family:${FONT};font-size:15px;line-height:23px;color:${C.text1};">
          Hola <strong>${esc(opts.businessName)}</strong>, tu cuenta está lista. Empecemos:
        </div>
      </td></tr>
      <tr><td style="padding:20px 24px 0;">
        ${callout({
          kicker: 'Paso 1 — Configurá tu bot',
          body: 'Ingresá al dashboard y completá la información de tu negocio: nombre, servicios, precios y horarios. Cuanto más completo, mejor responde tu bot.',
          cta: button('Ir al dashboard &rarr;'),
        })}
      </td></tr>
      <tr><td style="padding:14px 24px 0;">
        ${callout({
          tone: 'ok',
          kicker: 'Paso 2 — Activamos tu WhatsApp',
          body: 'Coordinamos con vos la activación de tu número de WhatsApp para que el bot empiece a atender a tus clientes. Te contactamos para dejarlo andando.',
        })}
      </td></tr>
      <tr><td style="padding:20px 24px 26px;">
        <div style="font-family:${FONT};font-size:13px;color:${C.text2};">¿Tenés dudas? Respondé este email y te ayudamos.</div>
      </td></tr>
      ${footer()}`,
  });

  await sendMail({
    to: opts.to,
    subject: 'Bienvenido a Wasso — empezá tu prueba gratis',
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

  const html = shell({
    title: 'Turno cancelado',
    preheader: `${opts.clientName} canceló su turno del ${opts.appointmentDate} a las ${opts.appointmentTime}.`,
    width: 520,
    body: `
      ${header('Turno cancelado', `${esc(opts.businessName)} · ${esc(opts.botName)}`)}
      <tr><td style="padding:24px 24px 0;">
        ${detailRows([
          ['Cliente', `${esc(opts.clientName)} <span style="font-weight:400;color:${C.text2};">(${esc(opts.clientPhone)})</span>`],
          ['Servicio', esc(opts.title)],
          ['Fecha', `${esc(opts.appointmentDate)} a las ${esc(opts.appointmentTime)}`],
        ])}
      </td></tr>
      <tr><td style="padding:16px 24px 0;">
        ${callout({ tone: 'warn', body: 'El cliente canceló automáticamente. El horario quedó disponible.' })}
      </td></tr>
      <tr><td style="padding:20px 24px 26px;">
        ${button('Ver en el dashboard &rarr;')}
      </td></tr>
      ${footer('Wasso · Sistema automático de atención por WhatsApp')}`,
  });

  await sendMail({
    to: opts.to,
    subject: `Turno cancelado — ${opts.clientName} (${opts.appointmentDate})`,
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

  const reasonText = opts.reason === 'keyword'
    ? `El cliente mencionó una palabra clave de escalación${opts.keyword ? ` ("${esc(opts.keyword)}")` : ''}.`
    : 'Se alcanzó el límite de mensajes automáticos.';

  const html = shell({
    title: 'Conversación escalada',
    preheader: `${opts.botName} necesita tu atención — ${reasonText}`,
    width: 520,
    body: `
      ${header('Conversación escalada', `${esc(opts.businessName)} · ${esc(opts.botName)}`)}
      <tr><td style="padding:24px 24px 0;">
        ${callout({ tone: 'warn', kicker: 'Necesita tu atención', body: reasonText })}
      </td></tr>
      <tr><td style="padding:16px 24px 0;">
        ${detailRows([
          ['Teléfono cliente', esc(opts.clientPhone)],
          ['Negocio', esc(opts.businessName)],
          ['Bot', esc(opts.botName)],
        ])}
      </td></tr>
      <tr><td style="padding:20px 24px 26px;">
        ${button('Ver conversación &rarr;')}
      </td></tr>
      ${footer('Wasso · Sistema automático de atención por WhatsApp')}`,
  });

  await sendMail({
    to: opts.to,
    subject: `${opts.botName} necesita tu atención — ${opts.businessName}`,
    html,
  });
}

export { DASHBOARD_URL };
