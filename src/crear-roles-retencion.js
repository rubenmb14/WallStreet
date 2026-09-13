require('dotenv').config();
const { REST, Routes } = require('discord.js');

const GUILD_ID = '1545794465468260453';

const PARES = [
  { rank: 'Resp', ws: '1545798839641051146', org: '1545948650784559125' },
  { rank: 'ADM', ws: '1545798793537265844', org: '1545938983656357898' },
  { rank: 'AUX', ws: '1545798788923523182', org: '1545946962648371371' },
  { rank: 'LIDER', ws: '1545798783521136780', org: '1545947044521447454' },
  { rank: 'SUBLIDER', ws: '1545798778144034947', org: '1545947138230329425' },
  { rank: 'MIEMBRO', ws: '1545798772993560576', org: '1545947212876353648' },
  { rank: 'PRUEBA', ws: '1545798767763267644', org: '1545947310305841193' },
];

async function main() {
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);

  const roles = await rest.get(Routes.guildRoles(GUILD_ID));
  const porId = new Map(roles.map((r) => [r.id, r]));

  const creados = [];
  for (const par of PARES) {
    const ws = porId.get(par.ws);
    const org = porId.get(par.org);
    if (!ws || !org) {
      console.log(`Falta rol: ${par.rank} (ws=${par.ws} org=${par.org})`);
      continue;
    }
    const nombre = ws.name.replace('WallStreet', 'Retención');
    const body = {
      name: nombre,
      permissions: org.permissions,
      color: org.color,
      hoist: org.hoist,
      mentionable: org.mentionable,
    };
    if (org.icon) body.icon = org.icon;
    if (org.unicodeEmoji) body.unicodeEmoji = org.unicodeEmoji;

    const nuevo = await rest.post(Routes.guildRoles(GUILD_ID), { body });
    creados.push({ rank: par.rank, id: nuevo.id });
    console.log(`Creado: ${nuevo.name} (${nuevo.id})`);
  }

  if (!creados.length) {
    console.log('No se creó ningún rol.');
    return;
  }

  const todos = await rest.get(Routes.guildRoles(GUILD_ID));
  const mapa = new Map(todos.map((r) => [r.id, r]));

  const secuencia = [];
  for (const par of PARES) {
    const ret = creados.find((c) => c.rank === par.rank);
    secuencia.push(par.ws);
    if (ret) secuencia.push(ret.id);
    secuencia.push(par.org);
  }

  const ancla = mapa.get(PARES[0].ws)?.position;
  if (ancla === undefined) {
    console.log('No encontré el rol ancla para ordenar.');
    return;
  }

  for (let i = 0; i < secuencia.length; i++) {
    const rolId = secuencia[i];
    const pos = ancla - i;
    if (pos < 0) {
      console.log(`Posición inválida para ${rolId} (${pos}). Deteniendo orden.`);
      break;
    }
    await rest.patch(Routes.guildRole(GUILD_ID, rolId), { body: { position: pos } });
  }

  console.log(`Orden aplicado (${secuencia.length} roles).`);
}

main().catch((error) => {
  console.error('Error:', error?.message || error);
  process.exit(1);
});