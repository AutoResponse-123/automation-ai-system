// ─────────────────────────────────────────────────────────────────────────────
// Sistema de diseño para emails de Wasso.
//
// Espejo de dashboard/src/App.css (tema "papel"). Si cambia la identidad visual
// del producto, se toca ACÁ y se propaga a todos los emails.
//
// Reglas de HTML para email — no son preferencias, son limitaciones reales:
//   · display:grid y flex se descartan en Gmail, Outlook y Yahoo → usar <table>.
//   · Los estilos van inline; <style> en el <head> se remueve en varios clientes.
//   · Los botones se arman con una tabla de fondo, no con <a> con background.
//   · Nada de gradientes: Outlook (motor Word) los ignora y queda el fondo pelado.
// ─────────────────────────────────────────────────────────────────────────────

export const DASHBOARD_URL = 'https://automation-ai-dashboard.vercel.app';

export const C = {
  accent:     '#1585C7',  // --accent
  accentDark: '#10689E',  // --accent-dark
  navy:       '#0F2233',  // --sidebar-bg
  navyLine:   '#1E3A4F',  // --sidebar-border
  navyText:   '#ECF1F6',  // --text-bright
  navyMuted:  '#8A96A3',  // --text-2 (tema oscuro)
  page:       '#F4F6F8',  // --bg-base
  card:       '#FFFFFF',  // --bg-card
  cardAlt:    '#EEF2F5',  // --bg-input
  border:     '#E2E7EC',  // --border-mid
  text1:      '#1F2937',
  text2:      '#5A6B78',
  text3:      '#8A97A3',
  // Estados: ámbar para "necesita tu atención", rojo sólo para cancelaciones.
  warnBg:     '#FFF7ED',
  warnBorder: '#FED7AA',
  warnText:   '#C2410C',
  dangerBg:   '#FEF2F2',
  dangerBorder: '#FECACA',
  dangerText: '#B91C1C',
  okBg:       '#F0FDF4',
  okBorder:   '#BBF7D0',
  okText:     '#15803D',
};

// Bricolage Grotesque (la fuente del dashboard) no está disponible en clientes
// de correo, así que caemos al stack del sistema.
export const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

// Escapa datos de clientes antes de inyectarlos en el HTML del email.
export function esc(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Header azul noche, igual que el sidebar del dashboard.
export function header(title: string, subtitle?: string) {
  return `<tr><td style="background:${C.navy};border-bottom:1px solid ${C.navyLine};padding:26px 28px;">
    <div style="font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:.10em;text-transform:uppercase;color:${C.accent};">Wasso</div>
    <div style="font-family:${FONT};font-size:19px;line-height:26px;font-weight:700;color:${C.navyText};margin-top:6px;">${title}</div>
    ${subtitle ? `<div style="font-family:${FONT};font-size:13px;line-height:18px;color:${C.navyMuted};margin-top:3px;">${subtitle}</div>` : ''}
  </td></tr>`;
}

// Botón sobre tabla: Outlook ignora padding en <a>, pero respeta el <td>.
export function button(label: string, href: string = DASHBOARD_URL, color: string = C.accent) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="background:${color};border-radius:8px;">
      <a href="${href}" style="display:inline-block;padding:12px 26px;font-family:${FONT};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${label}</a>
    </td></tr>
  </table>`;
}

// Tabla etiqueta/valor para los emails de detalle (escalación, cancelación...).
export function detailRows(rows: Array<[string, string]>) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="border:1px solid ${C.border};border-radius:10px;border-collapse:separate;overflow:hidden;">
    ${rows.map(([label, value], i) => `<tr style="background:${i % 2 ? C.cardAlt : C.card};">
      <td width="150" valign="top" style="padding:11px 14px;font-family:${FONT};font-size:13px;color:${C.text2};">${label}</td>
      <td valign="top" style="padding:11px 14px;font-family:${FONT};font-size:13px;color:${C.text1};font-weight:600;">${value}</td>
    </tr>`).join('')}
  </table>`;
}

// Bloque destacado (pasos del onboarding, avisos).
export function callout(opts: { kicker?: string; body: string; tone?: 'accent' | 'ok' | 'warn'; cta?: string }) {
  const tone = opts.tone ?? 'accent';
  const map = {
    accent: { bg: C.cardAlt,  border: C.border,       text: C.accentDark },
    ok:     { bg: C.okBg,     border: C.okBorder,     text: C.okText },
    warn:   { bg: C.warnBg,   border: C.warnBorder,   text: C.warnText },
  }[tone];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="background:${map.bg};border:1px solid ${map.border};border-radius:10px;">
    <tr><td style="padding:18px 20px;">
      ${opts.kicker ? `<div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${map.text};margin-bottom:8px;">${opts.kicker}</div>` : ''}
      <div style="font-family:${FONT};font-size:14px;line-height:21px;color:${C.text1};">${opts.body}</div>
      ${opts.cta ? `<div style="margin-top:14px;">${opts.cta}</div>` : ''}
    </td></tr>
  </table>`;
}

export function footer(text: string = 'Wasso · Tu asistente de WhatsApp con IA') {
  return `<tr><td style="background:${C.cardAlt};border-top:1px solid ${C.border};padding:16px 24px;">
    <div style="font-family:${FONT};font-size:11px;line-height:17px;color:${C.text3};">${text}</div>
  </td></tr>`;
}

// Envoltorio del email: doctype, preheader (el texto de vista previa en la
// bandeja) y la tabla contenedora centrada.
export function shell(opts: { title: string; preheader?: string; width?: number; body: string }) {
  const width = opts.width ?? 560;
  return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.preheader ?? '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="${width}" cellpadding="0" cellspacing="0" border="0"
         style="width:${width}px;max-width:100%;background:${C.card};border:1px solid ${C.border};border-radius:14px;overflow:hidden;">
    ${opts.body}
  </table>
</td></tr>
</table>
</body></html>`;
}
