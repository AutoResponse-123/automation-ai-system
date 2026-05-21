# automation-ai-system

AI automation system for WhatsApp business

# Automation AI System



Plataforma SaaS que automatiza atención al cliente vía WhatsApp usando Claude AI.



\## ¿Qué hace?



\- Recibe mensajes WhatsApp

\- Procesa con Claude AI

\- Guarda conversaciones en Supabase

\- Muestra dashboard en tiempo real



\## Stack



\- \*\*Backend:\*\* Node.js + Express + TypeScript

\- \*\*Frontend:\*\* React + Vite + Tailwind

\- \*\*IA:\*\* Claude 3.5 Sonnet (Anthropic)

\- \*\*BD:\*\* Supabase (PostgreSQL)

\- \*\*Mensajería:\*\* Twilio WhatsApp API

\- \*\*Hosting:\*\* Railway



\## Setup Local



\### Requisitos

\- Node.js v18+

\- Git

\- Cuenta Supabase

\- API Key Anthropic



\### Instalación



```bash

\# Clonar repo

git clone https://github.com/AutoResponse-123/automation-ai-system.git

cd automation-ai-system



\# Backend

cd backend

npm install

cp .env.example .env

\# Editar .env con tus credenciales

npm run dev



\# Frontend (otra terminal)

cd dashboard

npm install

npm run dev

```



\### Variables de Entorno



Crear `.env` en `backend/` con:

SUPABASE\_URL=tu\_url

SUPABASE\_ANON\_KEY=tu\_key

SUPABASE\_SERVICE\_ROLE\_KEY=tu\_key

ANTHROPIC\_API\_KEY=tu\_key

TWILIO\_ACCOUNT\_SID=tu\_sid

TWILIO\_AUTH\_TOKEN=tu\_token

TWILIO\_PHONE\_NUMBER=+1234567890

TWILIO\_WEBHOOK\_URL=https://tu-url.railway.app/api/webhooks/whatsapp

PORT=3000

NODE\_ENV=development

## Endpoints



\### Health Check

GET http://localhost:3000/health

Respuesta:

```json

{

&#x20; "status": "ok",

&#x20; "timestamp": "2026-05-21T00:38:42.000Z",

&#x20; "environment": "development"

}

```



\### Webhook WhatsApp

POST http://localhost:3000/api/webhooks/whatsapp

Body:

```json

{

&#x20; "From": "whatsapp:+5491112345678",

&#x20; "To": "whatsapp:+1234567890",

&#x20; "Body": "Hola, quiero agendar un turno"

}

```



Respuesta:

```xml

<?xml version="1.0" encoding="UTF-8"?>

<Response>

&#x20; <Message>Respuesta de Claude aquí</Message>

</Response>

```



\## Arquitectura

Cliente WhatsApp

↓

Twilio Gateway

↓

Backend Node.js

├→ Claude API (IA)

├→ Supabase (BD)

└→ Twilio (respuesta)

↓

Dashboard React (Realtime)

## Flujo de Mensaje



1\. Cliente envía mensaje WhatsApp

2\. Twilio valida y envía webhook

3\. Backend busca contexto en Supabase

4\. Claude genera respuesta

5\. Respuesta se guarda y envía a WhatsApp

6\. Dashboard se actualiza en tiempo real



\*\*Tiempo total:\*\* 500-1500ms



\## Base de Datos



\### Tablas



\- \*\*users:\*\* Dueños de negocios

\- \*\*businesses:\*\* Configuración por cliente

\- \*\*contacts:\*\* Clientes finales

\- \*\*conversations:\*\* Sesiones de chat

\- \*\*messages:\*\* Historial conversacional



\### SQL Inicial



Ver `docs/database.sql`



\## Costos (MVP)



| Servicio | Costo/mes |

|----------|-----------|

| Supabase | $0-25 |

| Claude API | $2-10 |

| Twilio | $0-5 |

| Railway | $5 |

| \*\*Total\*\* | \*\*$7-45\*\* |



\## Deploy a Producción



\### Railway



1\. Push a GitHub

2\. Conectar repo en Railway

3\. Agregar variables de entorno

4\. Deploy automático



URL: `https://automation-ai-system-production.up.railway.app`



\## Testing



\### Local



```bash

\# Backend

curl http://localhost:3000/health



\# Webhook

curl -X POST http://localhost:3000/api/webhooks/whatsapp \\

&#x20; -H "Content-Type: application/json" \\

&#x20; -d '{"From":"whatsapp:+123...","Body":"test"}'

```



\### Producción



```bash

curl -X POST https://automation-ai-system-production.up.railway.app/api/webhooks/whatsapp \\

&#x20; -H "Content-Type: application/json" \\

&#x20; -d '{"From":"whatsapp:+123...","Body":"test"}'

```



\## Roadmap



\- \[x] MVP core (webhook + Claude + BD)

\- \[x] Frontend realtime

\- \[x] Deploy a producción

\- \[ ] Autenticación multi-tenant

\- \[ ] Dashboard avanzado (analytics)

\- \[ ] n8n workflows

\- \[ ] Integración Google Calendar

\- \[ ] Multi-idioma



\## Troubleshooting



\*\*"Cannot find module..."\*\*

→ `npm install`



\*\*"supabaseUrl is required"\*\*

→ Verificar variables de entorno



\*\*Webhook devuelve 500\*\*

→ Revisar logs del backend



\*\*Dashboard no actualiza\*\*

→ Verificar conexión Supabase Realtime



\## Contribuir



1\. Fork el repo

2\. Crear branch: `git checkout -b feature/tu-feature`

3\. Commit: `git commit -m "feat: descripción"`

4\. Push: `git push origin feature/tu-feature`

5\. Pull Request



\## Licencia



MIT



\## Soporte



Email: soporte@automation-ai.com

Discord: \[link]

GitHub Issues: \[link]

