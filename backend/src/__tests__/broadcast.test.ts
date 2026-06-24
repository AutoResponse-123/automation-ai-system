export {};
const { resolveRecipients, uniqueByPhone, parseTemplate, resolveVars } = require('../services/broadcast');

const contacts = [
  { id: '1', phone: '+5491111', name: 'Ana', stage: 'nuevo' },
  { id: '2', phone: '+5492222', name: 'Beto', stage: 'agendó' },
  { id: '3', phone: '+5493333', name: 'Caro', stage: 'recurrente' },
  { id: '4', phone: '', name: 'SinTel', stage: 'nuevo' },
  { id: '5', phone: '+5491111', name: 'AnaDup', stage: 'nuevo' },
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
});

describe('uniqueByPhone', () => {
  it('elimina teléfonos repetidos (deja el primero)', () => {
    const out = uniqueByPhone(resolveRecipients(contacts, 'all'));
    expect(out.map((c: any) => c.id)).toEqual(['1', '2', '3']);
  });
});

describe('parseTemplate', () => {
  it('convierte tokens amigables a variables en orden', () => {
    const r = parseTemplate('Hola [nombre], te escribe [negocio]');
    expect(r.body).toBe('Hola {{1}}, te escribe {{2}}');
    expect(r.varKeys).toEqual(['nombre', 'negocio']);
  });
  it('reusa el mismo número para un token repetido', () => {
    const r = parseTemplate('[nombre], gracias [nombre]!');
    expect(r.body).toBe('{{1}}, gracias {{1}}!');
    expect(r.varKeys).toEqual(['nombre']);
  });
  it('sin tokens deja el cuerpo igual y varKeys vacío', () => {
    const r = parseTemplate('Promo de la semana');
    expect(r.body).toBe('Promo de la semana');
    expect(r.varKeys).toEqual([]);
  });
  it('soporta nombre, negocio y telefono', () => {
    const r = parseTemplate('[telefono] [nombre] [negocio]');
    expect(r.varKeys).toEqual(['telefono', 'nombre', 'negocio']);
    expect(r.body).toBe('{{1}} {{2}} {{3}}');
  });
});

describe('resolveVars', () => {
  const contact = { name: 'Ana', phone: '+549111', stage: 'nuevo' };
  it('mapea cada var_key al dato del contacto/negocio', () => {
    expect(resolveVars(['nombre', 'negocio'], contact, 'Barbería X')).toEqual({ '1': 'Ana', '2': 'Barbería X' });
    expect(resolveVars(['telefono'], contact, 'X')).toEqual({ '1': '+549111' });
  });
  it('sin var_keys devuelve objeto vacío', () => {
    expect(resolveVars([], contact, 'X')).toEqual({});
  });
});
