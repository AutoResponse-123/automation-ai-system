# Setup de wassoapp.com — paso a paso

Todo el código ya está listo y commiteado. Falta conectar el dominio.
Hacelo en este orden: si cargás el DNS antes de deployar, los visitantes
caen en la versión vieja durante unos minutos.

---

## Paso 1 — Push (tu terminal) ✅ HECHO

```
cd C:\Users\mgsaf\automation-ai-system
git push origin main
```

Van dos commits: `2dfa6d4` (favicon, íconos, precios, 14 días) y `7f16cec` (dominio).
Vercel deploya solo en cuanto llega a `main`. Esperá a que termine antes del paso 2.

Verificá que quedó bien entrando a https://landing-wasso.vercel.app — tenés que ver
el logo negro en la pestaña y los precios nuevos.

---

## Paso 2 — Vercel: conectar los dominios ✅ HECHO

Ya está. Los tres dominios quedaron agregados:

| Dominio | Proyecto |
|---|---|
| `wassoapp.com` | `landing` |
| `app.wassoapp.com` | `automation-ai-dashboard` |
| `admin.wassoapp.com` | `automation-ai-admin` |

Dos decisiones que tomé sobre la marcha:

- **Destildé "Redirect apex domains to www"**. Venía tildado por defecto. Si lo dejaba,
  `wassoapp.com` redirigía a `www.wassoapp.com` y el dominio principal pasaba a ser el
  www — que no coincide con el `canonical` ni el `og:url` que puse en el código.
  Así queda `wassoapp.com` limpio, sin www.
- **Los subdominios NO van a los proyectos `dashboard` y `admin`.** Esos están
  abandonados: son de junio y el último build de `dashboard` falló. Los que deployaron
  hoy y están funcionando son `automation-ai-dashboard` y `automation-ai-admin`.
  Ahí apunté los subdominios.

---

## Paso 3 — Cloudflare: cargar el DNS ✅ HECHO

Cloudflare → dominio `wassoapp.com` → **DNS** → **Records** → **Add record**

Estos son los valores exactos que me dio Vercel. Los tres son **CNAME**:

| Tipo | Nombre | Contenido | Proxy |
|---|---|---|---|
| CNAME | `@` | `cbae28d7710e8b07.vercel-dns-017.com` | **DNS only** |
| CNAME | `app` | `a46d82c14978f731.vercel-dns-017.com` | **DNS only** |
| CNAME | `admin` | `2ff314c9b68b3857.vercel-dns-017.com` | **DNS only** |

Sí, el primero es un CNAME en la raíz (`@`), que normalmente el DNS no permite.
Cloudflare lo resuelve con CNAME flattening, así que funciona sin problema.

Si viste `76.76.21.21` o `cname.vercel-dns.com` en algún tutorial: son los valores
viejos. Siguen andando, pero usá los de la tabla, que son los que Vercel asignó
específicamente a tus proyectos.

### ⚠️ Lo más importante de todo este documento

La columna **Proxy status** tiene que quedar en **DNS only** — la nube **gris**, no la naranja.

Cloudflare por defecto activa el proxy (nube naranja). Si lo dejás así con Vercel vas a
tener loops de redirección y errores de certificado SSL, y el síntoma es confuso: la página
carga a veces sí y a veces no. Es el error nº1 al combinar Cloudflare con Vercel.

Si ya lo guardaste en naranja: clic en la nube y cambia a gris. Tarda ~1 minuto.

### Verificar

Volvé a Vercel → Settings → Domains. En un minuto los tres tienen que pasar a
**Valid Configuration** con el candado. Si después de 5 minutos sigue en error,
revisá que la nube esté gris.

---

## Paso 4 — Cloudflare: la casilla contacto@wassoapp.com ✅ HECHO

Cloudflare → `wassoapp.com` → **Email** → **Email Routing** → **Get started**

1. **Destination address**: poné tu Gmail (`zaza42069zaza69@gmail.com`) y confirmá
   el mail de verificación que te llega
2. **Custom address**: creá `contacto@wassoapp.com` → *Send to* → tu Gmail
3. Cloudflare agrega los registros MX y SPF solo. **No los cargues a mano**

Probalo mandándote un mail a `contacto@wassoapp.com` desde otra cuenta.

Gratis, direcciones ilimitadas. Si después querés `soporte@`, `facturacion@`, etc., es
el mismo procedimiento y no cuesta nada.

### Para responder DESDE esa dirección (opcional)

Email Routing solo recibe. Para que tus respuestas salgan como `contacto@wassoapp.com`
en vez de tu Gmail:

Gmail → Configuración → Cuentas e importación → **Añadir otra dirección de correo**

- Nombre: `Wasso`
- Dirección: `contacto@wassoapp.com`
- Servidor SMTP: `smtp.resend.com`, puerto `465`, SSL
- Usuario: `resend`
- Contraseña: tu API key de Resend (la misma del backend)

Ya usás Resend para los mails del sistema, así que no es un servicio nuevo ni un costo extra.

---

## Paso 5 — Avisame

Cuando termines decime y verifico desde acá que el DNS resuelve bien, que el SSL está
activo, que la preview de WhatsApp levanta la imagen y que los links de privacy y terms
funcionan con las URLs limpias.

---

## Después de esto: Meta

Con el dominio andando ya podés mandar la verificación. Dos cosas para no tropezar:

- **Tu constancia de ARCA vence el 28 de agosto.** Mandala antes o generá una nueva
  (es instantáneo y gratis desde el portal de ARCA)
- En Business Manager cargá los datos **exactamente** como figuran en la constancia:
  - Nombre legal: `SAFARANO FEDERICO ALEX`
  - Dirección: `BRUSELAS 1480`, Ciudad Autónoma de Buenos Aires, CP `1408`
  - CUIT: `20-45013743-0`

Meta compara carácter por carácter contra el PDF. Que la landing muestre solo la ciudad
no interfiere: son campos distintos.
