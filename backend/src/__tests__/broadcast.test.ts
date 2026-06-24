export {};
const { resolveRecipients, uniqueByPhone } = require('../services/broadcast');

const contacts = [
  { id: '1', phone: '+5491111', name: 'Ana', stage: 'nuevo' },
  { id: '2', phone: '+5492222', name: 'Beto', stage: 'agendó' },
  { id: '3', phone: '+5493333', name: 'Caro', stage: 'recurrente' },
  { id: '4', phone: '', name: 'SinTel', stage: 'nuevo' },        // sin teléfono → se descarta
  { id: '5', phone: '+5491111', name: 'AnaDup', stage: 'nuevo' }, // teléfono repetido
];

describe('resolveRecipients', () => {
  it('"all" devuelve todos los que tienen teléfono', () => {
    expect(resolveRecipients(contacts, 'all').map((c: any) => c.id)).toEqual(['1', '2', '3', '5']);
  });

  it('filtra por etapa con prefijo stage:', () => {
    expect(resolveRecipients(contacts, 'stage:agendó').map((c: any) => c.id)).toEqual(['2']);
    expect(resolveRecipients(contacts, 'stage:nuevo').map((c: any) => c.id)).toEqual(['1', '5']);
  });

  it('acepta la etapa sin prefijo', () => {
    expect(resolveRecipients(contacts, 'recurrente').map((c: any) => c.id)).toEqual(['3']);
  });

  it('etapa sin contactos devuelve vacío', () => {
    expect(resolveRecipients(contacts, 'stage:perdido')).toEqual([]);
  });

  it('contacto sin stage cuenta como "nuevo"', () => {
    expect(resolveRecipients([{ phone: '+549' }], 'stage:nuevo').length).toBe(1);
  });
});

describe('uniqueByPhone', () => {
  it('elimina teléfonos repetidos (deja el primero)', () => {
    const out = uniqueByPhone(resolveRecipients(contacts, 'all'));
    expect(out.map((c: any) => c.id)).toEqual(['1', '2', '3']);
  });
});
