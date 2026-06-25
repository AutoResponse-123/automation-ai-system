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
  it('"all" devuelve todos los que tienen telefono', () => {
    expect(resolveRecipients(contacts, 'all').map((c: any) => c.id)).toEqual(['1', '2', '3', '5']);
  });
  it('filtra por etapa con prefijo stage:', () => {
    expect(resolveRecipients(contacts, 'stage:agendó').map((c: any) => c.id)).toEqual(['2']);
  });
  it('etapa sin contactos devuelve vacio', () => {
    expect(resolveRecipients(contacts, 'stage:perdido')).toEqual([]);
  });
});

describe('uniqueByPhone', () => {
  it('elimina telefonos repetidos (deja el primero)', () => {
    expect(uniqueByPhone(resolveRecipients(contacts, 'all')).map((c: any) => c.id)).toEqual(['1', '2', '3']);
  });
});

describe('parseTemplate', () => {
  it('convierte tokens a variables en orden', () => {
    const r = parseTemplate('Hola [nombre], te escribe [negocio]');
    expect(r.body).toBe('Hola {{1}}, te escribe {{2}}');
    expect(r.varKeys).toEqual(['nombre', 'negocio']);
  });
  it('reusa el mismo numero para un token repetido', () => {
    const r = parseTemplate('[nombre], gracias [nombre]!');
    expect(r.body).toBe('{{1}}, gracias {{1}}!');
    expect(r.varKeys).toEqual(['nombre']);
  });
  it('soporta variables de turno', () => {
    const r = parseTemplate('Hola [nombre], tu turno es el [fecha] a las [hora] ([servicio])');
    expect(r.body).toBe('Hola {{1}}, tu turno es el {{2}} a las {{3}} ({{4}})');
    expect(r.varKeys).toEqual(['nombre', 'fecha', 'hora', 'servicio']);
  });
  it('sin tokens deja el cuerpo igual', () => {
    expect(parseTemplate('Promo').varKeys).toEqual([]);
  });
});

describe('resolveVars', () => {
  const ctx = { nombre: 'Ana', negocio: 'Barberia X', telefono: '+549111', fecha: 'lunes 30 de junio', hora: '14:30', servicio: 'Corte' };
  it('mapea cada var_key al dato del contexto', () => {
    expect(resolveVars(['nombre', 'fecha', 'hora'], ctx)).toEqual({ '1': 'Ana', '2': 'lunes 30 de junio', '3': '14:30' });
    expect(resolveVars(['servicio', 'negocio'], ctx)).toEqual({ '1': 'Corte', '2': 'Barberia X' });
  });
  it('un dato faltante queda vacio', () => {
    expect(resolveVars(['fecha'], { nombre: 'Ana' })).toEqual({ '1': '' });
  });
  it('sin var_keys devuelve objeto vacio', () => {
    expect(resolveVars([], ctx)).toEqual({});
  });
});
