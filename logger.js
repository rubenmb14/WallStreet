const fs = require('node:fs');
const path = require('node:path');
const {
  Events,
  EmbedBuilder,
  AuditLogEvent,
  ChannelType,
} = require('discord.js');

const ARCHIVO_HISTORIAL = path.join(__dirname, 'historial.json');
const invitacionesCache = new Map();

function cargar() {
  try {
    return JSON.parse(fs.readFileSync(ARCHIVO_HISTORIAL, 'utf8'));
  } catch {
    return {};
  }
}

const historial = cargar();

function obtenerHistorialUsuario(guildId, userId) {
  return historial[`${guildId}:${userId}`] || [];
}

function registrarEvento(guildId, userId, tipo, detalle) {
  if (!userId) return;
  const clave = `${guildId}:${userId}`;
  if (!historial[clave]) historial[clave] = [];
  const eventos = historial[clave];
  eventos.push({ tipo, detalle, fecha: new Date().toISOString() });
  if (eventos.length > 200) {
    historial[clave] = eventos.slice(-200);
  }
  try {
    fs.writeFileSync(ARCHIVO_HISTORIAL, JSON.stringify(historial, null, 2));
  } catch {}
}

function canalLogsDe(bot, guild) {
  const cfg = bot.configDe(guild.id);
  if (!cfg.canalLogs) return null;
  const canal = guild.channels.cache.get(cfg.canalLogs);
  return canal && canal.isTextBased() ? canal : null;
}

async function logPara(bot, guild, data) {
  const canal = canalLogsDe(bot, guild);
  if (!canal) return;
  await canal.send(data).catch(() => {});
}

function excluido(bot, guild, canalId = null, rolIds = []) {
  const cfg = bot.configDe(guild.id);
  if (canalId && (cfg.excluirCanalesLog || []).includes(canalId)) return true;
  return rolIds.some((id) => (cfg.excluirRolesLog || []).includes(id));
}

async function obtenerEjecutor(guild, tipoAudit, objetivoId) {
  try {
    const { entries } = await guild.fetchAuditLogs({ type: tipoAudit, limit: 5 });
    const entrada = entries.find((e) => e.target?.id === objetivoId);
    return entrada?.executor ?? null;
  } catch {
    return null;
  }
}

async function actualizarCacheInvitaciones(guild) {
  try {
    const inv = await guild.invites.fetch();
    const mapa = new Map();
    for (const i of inv.values()) mapa.set(i.code, i.uses);
    invitacionesCache.set(guild.id, mapa);
    return mapa;
  } catch {
    return null;
  }
}

function initLogger(client) {
  const bot = client;

  bot.once(Events.ClientReady, async (c) => {
    for (const guild of c.guilds.cache.values()) {
      await actualizarCacheInvitaciones(guild);
    }
  });

  bot.on(Events.InviteCreate, async (inv) => {
    const cache = invitacionesCache.get(inv.guild.id) || new Map();
    cache.set(inv.code, inv.uses || 0);
    invitacionesCache.set(inv.guild.id, cache);
    await logPara(bot, inv.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setAuthor({ name: `Invitación creada por ${inv.inviter?.tag || 'desconocido'}`, iconURL: inv.inviter?.displayAvatarURL() })
          .setDescription(`📩 \`${inv.code}\` → <#${inv.channelId}>${inv.maxUses ? ` · máx ${inv.maxUses} usos` : ''}${inv.maxAge ? ` · caduca en ${Math.floor(inv.maxAge / 3600)}h` : ' · sin caducidad'}`),
      ],
    });
  });

  bot.on(Events.InviteDelete, async (inv) => {
    const cache = invitacionesCache.get(inv.guild.id) || new Map();
    cache.delete(inv.code);
    invitacionesCache.set(inv.guild.id, cache);
    await logPara(bot, inv.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription(`🗑️ Se eliminó la invitación \`${inv.code}\``),
      ],
    });
  });

  bot.on(Events.GuildMemberAdd, async (miembro) => {
    if (miembro.user.bot) return;
    const cfg = bot.configDe(miembro.guild.id);

    const antes = invitacionesCache.get(miembro.guild.id);
    const ahora = await actualizarCacheInvitaciones(miembro.guild);
    let codigo = 'desconocida';
    if (antes && ahora) {
      for (const [code, uses] of ahora) {
        if ((antes.get(code) || 0) < uses) codigo = code;
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setAuthor({ name: `${miembro.user.tag} entró al servidor`, iconURL: miembro.user.displayAvatarURL({ size: 128 }) })
      .addFields(
        { name: '👤 Usuario', value: `<@${miembro.id}>`, inline: true },
        { name: '🕐 Cuenta creada', value: `<t:${Math.floor(miembro.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: '📩 Entró por', value: `\`${codigo}\``, inline: true }
      )
      .setTimestamp();

    const dias = (Date.now() - miembro.user.createdTimestamp) / 86400000;
    if (cfg.diasCuentaSospechosa && dias < cfg.diasCuentaSospechosa) {
      embed.setColor(0xfee75c);
      embed.setTitle('⚠️ CUENTA SOSPECHOSA');
      embed.setDescription(`Está cuenta tiene menos de **${cfg.diasCuentaSospechosa} días** (${Math.floor(dias)}d).`);
    }

    await logPara(bot, miembro.guild, { embeds: [embed] });
    registrarEvento(miembro.guild.id, miembro.id, 'entrada', `Entró al servidor por \`${codigo}\``);
  });

  bot.on(Events.GuildMemberRemove, async (miembro) => {
    if (miembro.user?.bot) return;

    const ejecutor = await obtenerEjecutor(miembro.guild, AuditLogEvent.MemberKick, miembro.id);
    const tipo = ejecutor ? '👢 Expulsado' : '📤 Salida';
    const motivo = ejecutor ? ` por ${ejecutor.tag}` : ' (abandonó / fue expulsado fuera de bot)';

    await logPara(bot, miembro.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setAuthor({ name: `${miembro.user?miembro.user.tag:miembro.id} salió`, iconURL: miembro.user?.displayAvatarURL() })
          .setDescription(`${tipo}${motivo}`)
          .setTimestamp(),
      ],
    });
    registrarEvento(miembro.guild.id, miembro.id, ejecutor ? 'expulsion' : 'salida', `${tipo}:${motivo}`);
  });

  bot.on(Events.GuildMemberUpdate, async (antesM, nuevoM) => {
    if (nuevoM.user.bot) return;
    const otrosCambios = [];

    const rolesAñadidos = nuevoM.roles.cache.filter((r) => !antesM.roles.cache.has(r.id));
    const rolesQuitados = antesM.roles.cache.filter((r) => !nuevoM.roles.cache.has(r.id));

    if (rolesAñadidos.size || rolesQuitados.size) {
      let ejecutor = null;
      try {
        const { entries } = await nuevoM.guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 5 });
        const entrada = entries.find((e) => e.target?.id === nuevoM.id);
        ejecutor = entrada?.executor ?? null;
      } catch {}

      for (const rol of rolesAñadidos.values()) {
        await logPara(bot, nuevoM.guild, {
          embeds: [
            new EmbedBuilder()
              .setColor(0x57f287)
              .setAuthor({ name: `Rol añadido a ${nuevoM.user.tag}`, iconURL: nuevoM.user.displayAvatarURL({ size: 128 }) })
              .setDescription(`➕ <@&${rol.id}>`)
              .addFields(
                { name: '👤 Usuario', value: `<@${nuevoM.id}>`, inline: true },
                { name: '🙋 Quién', value: ejecutor ? `<@${ejecutor.id}>` : 'desconocido', inline: true }
              )
              .setTimestamp(),
          ],
        });
        registrarEvento(nuevoM.guild.id, nuevoM.id, 'rol', `Añadido: ${rol.name}${ejecutor ? ` por ${ejecutor.tag}` : ''}`);
      }

      for (const rol of rolesQuitados.values()) {
        await logPara(bot, nuevoM.guild, {
          embeds: [
            new EmbedBuilder()
              .setColor(0xffa657)
              .setAuthor({ name: `Rol quitado a ${nuevoM.user.tag}`, iconURL: nuevoM.user.displayAvatarURL({ size: 128 }) })
              .setDescription(`➖ <@&${rol.id}>`)
              .addFields(
                { name: '👤 Usuario', value: `<@${nuevoM.id}>`, inline: true },
                { name: '🙋 Quién', value: ejecutor ? `<@${ejecutor.id}>` : 'desconocido', inline: true }
              )
              .setTimestamp(),
          ],
        });
        registrarEvento(nuevoM.guild.id, nuevoM.id, 'rol', `Quitado: ${rol.name}${ejecutor ? ` por ${ejecutor.tag}` : ''}`);
      }
    }

    if (antesM.nickname !== nuevoM.nickname) {
      otrosCambios.push(`🏷️ Apodo: **${antesM.nickname || 'sin apodo'}** → **${nuevoM.nickname || 'sin apodo'}**`);
      registrarEvento(nuevoM.guild.id, nuevoM.id, 'apodo', `"${antesM.nickname || ''}" → "${nuevoM.nickname || ''}"`);
    }

    if (antesM.communicationDisabledUntil !== nuevoM.communicationDisabledUntil) {
      if (nuevoM.communicationDisabledUntil) {
        otrosCambios.push(`⏳ **Timeout** hasta <t:${Math.floor(nuevoM.communicationDisabledUntil.getTime() / 1000)}:F>`);
        registrarEvento(nuevoM.guild.id, nuevoM.id, 'timeout', 'Timeout puesto');
      } else {
        otrosCambios.push(`▶️ **Timeout quitado**`);
        registrarEvento(nuevoM.guild.id, nuevoM.id, 'timeout', 'Timeout quitado');
      }
    }

    if (!otrosCambios.length) return;

    await logPara(bot, nuevoM.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setAuthor({ name: `${nuevoM.user.tag} actualizado`, iconURL: nuevoM.user.displayAvatarURL({ size: 128 }) })
          .setDescription(otrosCambios.join('\n'))
          .setTimestamp(),
      ],
    });
  });

  bot.on(Events.UserUpdate, async (antesU, nuevoU) => {
    const cambios = [];
    if (antesU.avatar !== nuevoU.avatar) cambios.push(`🖼️ Avatar actualizado: ${antesU.displayAvatarURL()} → ${nuevoU.displayAvatarURL()}`);
    if (antesU.username !== nuevoU.username) cambios.push(`👤 Nombre de usuario: **${antesU.username}** → **${nuevoU.username}**`);
    if (antesU.globalName !== nuevoU.globalName) cambios.push(`🏷️ Apodo global: **${antesU.globalName || '—'}** → **${nuevoU.globalName || '—'}**`);
    if (!cambios.length) return;

    for (const guild of bot.guilds.cache.values()) {
      if (!guild.members.cache.has(nuevoU.id)) continue;
      await logPara(bot, guild, {
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setAuthor({ name: `${nuevoU.tag} cambió su perfil`, iconURL: nuevoU.displayAvatarURL({ size: 128 }) })
            .setDescription(cambios.join('\n'))
            .setTimestamp(),
        ],
      });
    }
  });

  bot.on(Events.MessageUpdate, async (antesM, nuevoM) => {
    if (!antesM.content || !nuevoM.content || antesM.content === nuevoM.content) return;
    if (antesM.author?.bot) return;
    if (excluido(bot, antiguoGuild(antesM), antesM.channelId)) return;

    await logPara(bot, antiguoGuild(antesM), {
      embeds: [
        new EmbedBuilder()
          .setColor(0xffa657)
          .setAuthor({ name: `Mensaje editado por ${antesM.author?.tag || 'desconocido'}`, iconURL: antesM.author?.displayAvatarURL() })
          .setDescription(
            `**Antes:**\n${antesM.content.slice(0, 1000)}\n\n**Después:**\n${nuevoM.content.slice(0, 1000)}`
          )
          .addFields(
            { name: '🌐 Canal', value: `<#${antesM.channelId}>`, inline: true },
            { name: '🔗 Salta al mensaje', value: `[Click](https://discord.com/channels/${antesM.guildId}/${antesM.channelId}/${antesM.id})`, inline: true }
          )
          .setTimestamp(),
      ],
    });
  });

  bot.on(Events.MessageDelete, async (mensaje) => {
    if (mensaje.author?.bot) return;
    if (excluido(bot, antiguoGuild(mensaje), mensaje.channelId)) return;

    const canal = mensaje.guild?.channels.cache.get(mensaje.channelId);
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setAuthor({ name: `Mensaje borrado (${mensaje.author ? mensaje.author.tag : 'no cacheado'})`, iconURL: mensaje.author?.displayAvatarURL() })
      .setDescription(mensaje.content ? mensaje.content.slice(0, 1000) : '*sin contenido cached*')
      .addFields(
        { name: '🌐 Canal', value: canal ? `<#${canal.id}>` : `\`${mensaje.channelId}\``, inline: true },
        { name: '🆔 ID', value: `\`${mensaje.id}\``, inline: true }
      )
      .setTimestamp();

    await logPara(bot, antiguoGuild(mensaje), { embeds: [embed] });
  });

  bot.on(Events.MessageBulkDelete, async (mensajes, canal) => {
    if (!canal.guild) return;
    if (excluido(bot, canal.guild, canal.id)) return;

    const lista = mensajes
      .filter((m) => !m.author?.bot && m.content)
      .map((m) => `${m.author?.tag || '?'}: ${m.content.slice(0, 120)}`)
      .slice(0, 10)
      .join('\n');

    await logPara(bot, canal.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setAuthor({ name: `Borrado masivo en <#${canal.id}>`, iconURL: bot.user.displayAvatarURL() })
          .setDescription(lista ? `**Primeros contenidos:**\n${lista}` : `${mensajes.size} mensajes borrados sin contenido cacheado.`),
      ],
    });
  });

  bot.on(Events.GuildUpdate, async (antesG, nuevoG) => {
    const cambios = [];
    if (antesG.name !== nuevoG.name) cambios.push(`🏷️ Nombre: **${antesG.name}** → **${nuevoG.name}**`);
    if (antesG.icon !== nuevoG.icon) cambios.push(`🖼️ Icono actualizado`);
    if (antesG.banner !== nuevoG.banner) cambios.push(`🖼️ Banner actualizado`);
    if (antesG.description !== nuevoG.description) cambios.push(`📝 Descripción: ${nuevoG.description || 'eliminada'}`);
    if (!cambios.length) return;

    await logPara(bot, nuevoG, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setDescription('⚙️ **El servidor cambió sus ajustes**\n' + cambios.join('\n'))
          .setTimestamp(),
      ],
    });
  });

  bot.on(Events.ChannelCreate, async (canal) => {
    if (!canal.guild) return;
    await logPara(bot, canal.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(`📂 Canal creado: <#${canal.id}> (${canal.type === ChannelType.GuildText ? 'texto' : canal.type === ChannelType.GuildVoice ? 'voz' : canal.type === ChannelType.GuildCategory ? 'categoría' : 'otro'})`),
      ],
    });
  });

  bot.on(Events.ChannelDelete, async (canal) => {
    if (!canal.guild) return;
    await logPara(bot, canal.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription(`🗑️ Canal borrado: **${canal.name}** (${canal.type === ChannelType.GuildText ? 'texto' : canal.type === ChannelType.GuildVoice ? 'voz' : canal.type === ChannelType.GuildCategory ? 'categoría' : 'otro'})`),
      ],
    });
  });

  bot.on(Events.ChannelUpdate, async (antesC, nuevoC) => {
    if (!nuevoC.guild) return;
    const cambios = [];
    if (antesC.name !== nuevoC.name) cambios.push(`🏷️ **${antesC.name}** → **${nuevoC.name}**`);
    if (antesC.topic !== nuevoC.topic) cambios.push(`📝 Tema: ${nuevoC.topic || 'eliminado'}`);
    if (!cambios.length) return;

    await logPara(bot, nuevoC.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xffa657)
          .setDescription(`⚙️ Canal <#${nuevoC.id}> actualizado\n${cambios.join('\n')}`),
      ],
    });
  });

  bot.on(Events.RoleCreate, async (rol) => {
    await logPara(bot, rol.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(`🎨 Rol creado: <@&${rol.id}> (\`${rol.name}\`)`),
      ],
    });
  });

  bot.on(Events.RoleDelete, async (rol) => {
    await logPara(bot, rol.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription(`🗑️ Rol borrado: **${rol.name}** (\`${rol.id}\`)`),
      ],
    });
  });

  bot.on(Events.RoleUpdate, async (antesR, nuevoR) => {
    const cambios = [];
    if (antesR.name !== nuevoR.name) cambios.push(`🏷️ **${antesR.name}** → **${nuevoR.name}**`);
    if (antesR.color !== nuevoR.color) cambios.push(`🎨 Color: \`#${antesR.color.toString(16)}\` → \`#${nuevoR.color.toString(16)}\``);
    if (!cambios.length) return;

    await logPara(bot, nuevoR.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xffa657)
          .setDescription(`⚙️ Rol <@&${nuevoR.id}> actualizado\n${cambios.join('\n')}`),
      ],
    });
  });

  bot.on(Events.GuildBanAdd, async (ban) => {
    const ejecutor = await obtenerEjecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    await logPara(bot, ban.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setAuthor({ name: `${ban.user.tag} fue baneado`, iconURL: ban.user.displayAvatarURL({ size: 128 }) })
          .addFields(
            { name: '👤 Usuario', value: `<@${ban.user.id}>`, inline: true },
            { name: '⛓️ Por', value: ejecutor ? `<@${ejecutor.id}>` : 'desconocido', inline: true },
            { name: '📝 Razón', value: ban.reason || 'sin razón', inline: false }
          )
          .setTimestamp(),
      ],
    });
    registrarEvento(ban.guild.id, ban.user.id, 'ban', `Baneado por ${ejecutor?.tag || 'desconocido'}${ban.reason ? `: ${ban.reason}` : ''}`);
  });

  bot.on(Events.GuildBanRemove, async (ban) => {
    const ejecutor = await obtenerEjecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
    await logPara(bot, ban.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setAuthor({ name: `${ban.user.tag} fue desbaneado`, iconURL: ban.user.displayAvatarURL({ size: 128 }) })
          .addFields(
            { name: '👤 Usuario', value: `<@${ban.user.id}>`, inline: true },
            { name: '🔓 Por', value: ejecutor ? `<@${ejecutor.id}>` : 'desconocido', inline: true }
          )
          .setTimestamp(),
      ],
    });
    registrarEvento(ban.guild.id, ban.user.id, 'unban', `Desbaneado por ${ejecutor?.tag || 'desconocido'}`);
  });

  bot.on(Events.VoiceStateUpdate, async (antesV, nuevoV) => {
    if (nuevoV.member?.user.bot) return;
    const guild = nuevoV.guild;

    if (!antesV.channelId && nuevoV.channelId) {
      await logPara(bot, guild, {
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setDescription(`🔊 **${nuevoV.member?.user.tag}** entró a <#${nuevoV.channelId}>`),
        ],
      });
    } else if (antesV.channelId && !nuevoV.channelId) {
      await logPara(bot, guild, {
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setDescription(`🔇 **${antesV.member?.user.tag || '?'}** salió de <#${antesV.channelId}>`),
        ],
      });
    } else if (antesV.channelId && nuevoV.channelId && antesV.channelId !== nuevoV.channelId) {
      await logPara(bot, guild, {
        embeds: [
          new EmbedBuilder()
            .setColor(0xffa657)
            .setDescription(`🔀 **${nuevoV.member?.user.tag}** se movió: <#${antesV.channelId}> → <#${nuevoV.channelId}>`),
        ],
      });
    }
  });

  bot.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    await logPara(bot, interaction.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setAuthor({ name: `Comando usado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ size: 64 }) })
          .setDescription(`💻 \`/${interaction.commandName}\` ${interaction.channel ? `en <#${interaction.channel.id}>` : ''}`)
          .setTimestamp(),
      ],
    });
    registrarEvento(interaction.guild?.id, interaction.user.id, 'comando', `Usó /${interaction.commandName}`);
  });
}

function antiguoGuild(mensaje) {
  if (mensaje.guild) return mensaje.guild;
  if (mensaje.channel?.guild) return mensaje.channel.guild;
  return null;
}

module.exports = {
  initLogger,
  obtenerHistorialUsuario,
  registrarEvento,
};