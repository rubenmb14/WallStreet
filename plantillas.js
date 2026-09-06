const fs = require('node:fs');
const path = require('node:path');
const { EmbedBuilder } = require('discord.js');

const ARCHIVO_MENSAJES = path.join(__dirname, 'plantilla_mensajes.json');

const CONFIGURACION_POR_DEFECTO = {
  categorias: ['Master', 'Resp', 'ADM', 'Auxiliar', 'Lider', 'Sub', 'Miembro', 'Miembro Test'],
  etiquetas: {
    Master: 'Master.',
    Resp: 'Resp.',
    ADM: 'ADM.',
    Auxiliar: 'Auxiliar.',
    Lider: 'Lider.',
    Sub: 'Sub.',
    Miembro: 'Miembro.',
    'Miembro Test': 'Miembro Test.',
  },
};

let mensajes = {};
try {
  mensajes = JSON.parse(fs.readFileSync(ARCHIVO_MENSAJES, 'utf8'));
} catch {}

function guardarMensajes() {
  try {
    fs.writeFileSync(ARCHIVO_MENSAJES, JSON.stringify(mensajes, null, 2));
  } catch {}
}

function configDe(client, guildId) {
  return client.configDe ? client.configDe(guildId) : {};
}

function categoriasDe(config) {
  const order = config.plantillaRangos?.orden || CONFIGURACION_POR_DEFECTO.categorias;
  const etiquetas = { ...CONFIGURACION_POR_DEFECTO.etiquetas, ...(config.plantillaRangos?.etiquetas || {}) };
  return { order, etiquetas };
}

function esRangoValidoParaEquipo(config, rankRoleId, teamRoleId, equipos) {
  const equiposWs = new Set(Object.entries(config.equipos || {})
    .filter(([label]) => !label.includes('ORGs'))
    .map(([, id]) => id));
  if (equiposWs.has(teamRoleId)) {
    return Object.values(config.rangosWS || {}).includes(rankRoleId);
  }
  return Object.values(config.rangosOrgs || {}).includes(rankRoleId);
}

function calcularPlantilla(guild, equipoLabel, equipoId, config) {
  const { order, etiquetas } = categoriasDe(config);
  const mapping = config.plantillaRangos?.roles || {};

  const porCategoria = new Map(order.map((c) => [c, { count: 0, usuarios: [] }]));
  let total = 0;

  for (const miembro of guild.members.cache.values()) {
    if (miembro.user.bot) continue;
    if (!miembro.roles.cache.has(equipoId)) continue;
    total += 1;

    let mejorCategoria = null;
    for (const [categoria] of porCategoria) {
      const rolesDeCategoria = Object.entries(mapping)
        .filter(([, c]) => c === categoria)
        .map(([id]) => id);
      const tieneRango = rolesDeCategoria.some((id) => miembro.roles.cache.has(id) && esRangoValidoParaEquipo(config, id, equipoId, config.equipos));
      if (tieneRango) {
        mejorCategoria = categoria;
        break;
      }
    }

    if (mejorCategoria) {
      const dato = porCategoria.get(mejorCategoria);
      dato.count += 1;
      dato.usuarios.push(`<@${miembro.id}>`);
    }
  }

  return { order, etiquetas, porCategoria, total };
}

function construirEmbed(guild, equipoLabel, equipoId, config, datos) {
  const { order, etiquetas, porCategoria, total } = datos;
  const embed = new EmbedBuilder()
    .setTitle('📌 PLANTILLA EQUIPOS')
    .setColor(0x5865f2)
    .addFields({ name: '| @Mencion del Equipo Correspondiente', value: `<@&${equipoId}>`, inline: false });

  for (const categoria of order) {
    const dato = porCategoria.get(categoria);
    const usuarios = dato.usuarios.length ? dato.usuarios.join(' ') : 'N/A';
    embed.addFields({
      name: `${etiquetas[categoria] || categoria}. del Equipo Correspondiente`,
      value: `= **${dato.count}**\n${usuarios}`,
      inline: false,
    });
  }

  embed.addFields({ name: '📊 TOTAL', value: `= **${total}**`, inline: false });
  return embed;
}

async function actualizarPlantillas(guild) {
  if (!guild) return;
  const client = guild.client;
  const config = configDe(client, guild.id);
  const canalId = config.canalPlantillas;
  if (!canalId) return;
  const canal = guild.channels.cache.get(canalId);
  if (!canal?.isTextBased()) return;

  for (const [equipoLabel, equipoId] of Object.entries(config.equipos || {})) {
    if (!equipoId) continue;
    const datos = calcularPlantilla(guild, equipoLabel, equipoId, config);
    const embed = construirEmbed(guild, equipoLabel, equipoId, config, datos);

    const previo = mensajes[guild.id]?.[equipoId];
    let mensaje = null;
    if (previo) {
      try {
        mensaje = await canal.messages.fetch(previo).catch(() => null);
      } catch {}
    }

    try {
      if (mensaje) {
        mensaje.edit({ embeds: [embed] }).catch(() => {});
      } else {
        const enviado = await canal.send({ embeds: [embed] });
        if (!mensajes[guild.id]) mensajes[guild.id] = {};
        mensajes[guild.id][equipoId] = enviado.id;
        guardarMensajes();
      }
    } catch {}
  }
}

module.exports = { actualizarPlantillas };