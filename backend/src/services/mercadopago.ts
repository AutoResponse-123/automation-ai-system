export {};

/**
 * Genera un link de pago de Mercado Pago usando la Checkout API.
 * Docs: https://www.mercadopago.com.ar/developers/es/reference/preferences/resource
 */
async function createPaymentLink(params: {
  accessToken: string
  title: string
  amount: number
  currency?: string   // ARS por defecto
  description?: string
  externalRef?: string
}): Promise<{ url: string; preferenceId: string }> {
  const { accessToken, title, amount, currency = 'ARS', description, externalRef } = params

  const body: any = {
    items: [{
      title,
      quantity: 1,
      unit_price: amount,
      currency_id: currency,
      description: description ?? title,
    }],
    auto_return: 'approved',
  }
  if (externalRef) body.external_reference = externalRef

  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`MercadoPago error ${res.status}: ${err}`)
  }

  const data: any = await res.json()
  return {
    url: data.init_point,          // URL pública (producción)
    preferenceId: data.id,
  }
}

module.exports = { createPaymentLink }
