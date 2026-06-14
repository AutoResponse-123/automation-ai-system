-- Mercado Pago simplificado: en vez del Access Token (API), el negocio guarda su
-- alias/CVU o link de cobro y el bot lo comparte cuando un cliente quiere pagar.
-- Aplicado vía Supabase MCP el 2026-06-14. Archivo para paridad/documentación.

alter table public.businesses add column if not exists mp_payment_link text;

-- Nota: mp_access_token sigue existiendo (vía API queda dormida; solo se activa
-- si un negocio carga un token, cosa que la UI nueva ya no hace).
