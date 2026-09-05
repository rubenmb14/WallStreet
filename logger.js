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
const avisosEmitidos = new Set();

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

function canalAlertasDe(bot, guild) {
  const cfg = bot.configDe(guild.id);
  if (!cfg.canalAlertas) return null;
  const canal = guild.channels.cache.get(cfg.canalAlertas);
  return canal && canal.isTextBased() ? canal : null;
}

async function alertaDe(bot, guild, descripcion, color = 0xed4245, autor = '⚠️ Alerta del bot') {
  const canal = canalAlertasDe(bot, guild);
  if (!canal) return;
  await canal
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(color)
          .setAuthor({ name: autor })
          .setDescription(descripcion)
          .setTimestamp(),
      ],
    })
    .catch(() => {});
}

async function logPara(bot, guild, data) {
  if (!guild) return;
  const canal = canalLogsDe(bot, guild);
  if (!canal) {
    const clave = `logs:${guild.id}`;
    if (!avisosEmitidos.has(clave)) {
      avisosEmitidos.add(clave);
      alertaDe(bot, guild, '⚠️ **No encuentro el canal de logs** (`canalLogs`).\nComprueba que el ID de `config.json` es correcto y que el bot ve ese canal.', 0xfee75c, '⚙️ Configuración');
    }
    return;
  }
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

function tipoCanal(canal) {
  if (canal.type === ChannelType.GuildText || canal.type === ChannelType.GuildAnnouncement) return 'texto';
  if (canal.type === ChannelType.GuildVoice || canal.type === ChannelType.GuildStageVoice) return 'voz';
  if (canal.type === ChannelType.GuildCategory) return 'categoría';
  if (canal.type === ChannelType.GuildForum) return 'foro';
  if (canal.type === ChannelType.PublicThread || canal.type === ChannelType.PrivateThread) return 'hilo';
  return 'otro';
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
    if (antesG.splash !== nuevoG.splash) cambios.push(`🌊 Splash screen: ${nuevoG.splash ? 'enlazada' : 'eliminada'}`);
    if (antesG.verificationLevel !== nuevoG.verificationLevel) cambios.push(`🔒 Nivel de verificación: **${antesG.verificationLevel}** → **${nuevoG.verificationLevel}**`);
    if (antesG.mfaLevel !== nuevoG.mfaLevel) cambios.push(`🔐 2FA: nivel **${antesG.mfaLevel}** → **${nuevoG.mfaLevel}**`);
    const ejecutor = await obtenerEjecutor(nuevoG, AuditLogEvent.GuildUpdate, nuevoG.id);
    const lineaEjecutor = ejecutor ? `\n🙋 Quién: <@${ejecutor.id}>` : '';
    if (!cambios.length) return;

    await logPara(bot, nuevoG, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xffa657)
          .setDescription('⚙️ **El servidor cambió sus ajustes**\n' + cambios.join('\n') + lineaEjecutor)
          .setTimestamp(),
      ],
    });
  });

  bot.on(Events.ChannelCreate, async (canal) => {
    if (!canal.guild) return;
    const ejecutor = await obtenerEjecutor(canal.guild, AuditLogEvent.ChannelCreate, canal.id);
    await logPara(bot, canal.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(`📂 Canal creado: <#${canal.id}> (${tipoCanal(canal)})${ejecutor ? `\n🙋 Quién: <@${ejecutor.id}>` : ''}`),
      ],
    });
  });

  bot.on(Events.ChannelDelete, async (canal) => {
    if (!canal.guild) return;
    const ejecutor = await obtenerEjecutor(canal.guild, AuditLogEvent.ChannelDelete, canal.id);
    await logPara(bot, canal.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription(`🗑️ Canal borrado: **${canal.name}** (${tipoCanal(canal)})${ejecutor ? `\n🙋 Quién: <@${ejecutor.id}>` : ''}`),
      ],
    });
  });

  bot.on(Events.ChannelUpdate, async (antesC, nuevoC) => {
    if (!nuevoC.guild) return;
    const cambios = [];
    if (antesC.name !== nuevoC.name) cambios.push(`🏷️ **${antesC.name}** → **${nuevoC.name}**`);
    if (antesC.topic !== nuevoC.topic) cambios.push(`📝 Tema: ${nuevoC.topic || 'eliminado'}`);
    if (antesC.rateLimitPerUser !== nuevoC.rateLimitPerUser) cambios.push(`🐢 Slowmode: ${antesC.rateLimitPerUser || 0}s → ${nuevoC.rateLimitPerUser || 0}s`);
    if (antesC.nsfw !== nuevoC.nsfw) cambios.push(`🔞 NSFW: ${antesC.nsfw ? 'sí' : 'no'} → ${nuevoC.nsfw ? 'sí' : 'no'}`);
    if (nuevoC.isVoiceBased()) {
      if (antesC.bitrate !== nuevoC.bitrate) cambios.push(`🎵 Bitrate: ${antesC.bitrate / 1000} kbps → ${nuevoC.bitrate / 1000} kbps`);
      if (antesC.userLimit !== nuevoC.userLimit) cambios.push(`👥 Límite: ${antesC.userLimit || 'sin límite'} → ${nuevoC.userLimit || 'sin límite'}`);
    }
    if (!cambios.length) return;
    const ejecutor = await obtenerEjecutor(nuevoC.guild, AuditLogEvent.ChannelUpdate, nuevoC.id);

    await logPara(bot, nuevoC.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xffa657)
          .setDescription(`⚙️ Canal <#${nuevoC.id}> actualizado\n${cambios.join('\n')}${ejecutor ? `\n🙋 Quién: <@${ejecutor.id}>` : ''}`),
      ],
    });
  });

  bot.on(Events.RoleCreate, async (rol) => {
    const ejecutor = await obtenerEjecutor(rol.guild, AuditLogEvent.RoleCreate, rol.id);
    await logPara(bot, rol.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(`🎨 Rol creado: <@&${rol.id}> (\`${rol.name}\`)${ejecutor ? `\n🙋 Quién: <@${ejecutor.id}>` : ''}`),
      ],
    });
  });

  bot.on(Events.RoleDelete, async (rol) => {
    const ejecutor = await obtenerEjecutor(rol.guild, AuditLogEvent.RoleDelete, rol.id);
    await logPara(bot, rol.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription(`🗑️ Rol borrado: **${rol.name}** (\`${rol.id}\`)${ejecutor ? `\n🙋 Quién: <@${ejecutor.id}>` : ''}`),
      ],
    });
  });

  bot.on(Events.RoleUpdate, async (antesR, nuevoR) => {
    const cambios = [];
    if (antesR.name !== nuevoR.name) cambios.push(`🏷️ **${antesR.name}** → **${nuevoR.name}**`);
    if (antesR.color !== nuevoR.color) cambios.push(`🎨 Color: \`#${antesR.color.toString(16)}\` → \`#${nuevoR.color.toString(16)}\``);
    if (antesR.hoist !== nuevoR.hoist) cambios.push(`☑️ Mostrar aparte: ${antesR.hoist ? 'sí' : 'no'} → ${nuevoR.hoist ? 'sí' : 'no'}`);
    if (antesR.mentionable !== nuevoR.mentionable) cambios.push(`📣 Mencionable: ${antesR.mentionable ? 'sí' : 'no'} → ${nuevoR.mentionable ? 'sí' : 'no'}`);
    if (antesR.permissions.bitfield !== nuevoR.permissions.bitfield) cambios.push(`🔑 Permisos modificados`);
    if (!cambios.length) return;
    const ejecutor = await obtenerEjecutor(nuevoR.guild, AuditLogEvent.RoleUpdate, nuevoR.id);

    await logPara(bot, nuevoR.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xffa657)
          .setDescription(`⚙️ Rol <@&${nuevoR.id}> actualizado\n${cambios.join('\n')}${ejecutor ? `\n🙋 Quién: <@${ejecutor.id}>` : ''}`),
      ],
    });
  });

  bot.on(Events.EmojiCreate, async (emoji) => {
    const ejecutor = await obtenerEjecutor(emoji.guild, AuditLogEvent.EmojiCreate, emoji.id);
    await logPara(bot, emoji.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(`😀 Emoji creado: ${emoji} \`${emoji.name}\`${ejecutor ? `\n🙋 Quién: <@${ejecutor.id}>` : ''}`),
      ],
    });
  });

  bot.on(Events.EmojiDelete, async (emoji) => {
    await logPara(bot, emoji.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription(`🗑️ Emoji borrado: \`${emoji.name}\``),
      ],
    });
  });

  bot.on(Events.EmojiUpdate, async (antesE, nuevoE) => {
    if (antesE.name === nuevoE.name) return;
    await logPara(bot, nuevoE.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xffa657)
          .setDescription(`✏️ Emoji renombrado: \`${antesE.name}\` → \`${nuevoE.name}\``),
      ],
    });
  });

  bot.on(Events.StickerCreate, async (sticker) => {
    await logPara(bot, sticker.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(`🖼️ Pegatina creada: \`${sticker.name}\``),
      ],
    });
  });

  bot.on(Events.StickerDelete, async (sticker) => {
    await logPara(bot, sticker.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription(`🗑️ Pegatina borrada: \`${sticker.name}\``),
      ],
    });
  });

  bot.on(Events.StickerUpdate, async (antesS, nuevoS) => {
    if (antesS.name === nuevoS.name && antesS.description === nuevoS.description) return;
    const cambios = [];
    if (antesS.name !== nuevoS.name) cambios.push(`🏷️ \`${antesS.name}\` → \`${nuevoS.name}\``);
    if (antesS.description !== nuevoS.description) cambios.push(`📝 Descripción: ${antesS.description || '—'} → ${nuevoS.description || '—'}`);
    await logPara(bot, nuevoS.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xffa657)
          .setDescription(`✏️ Pegatina actualizada\n${cambios.join('\n')}`),
      ],
    });
  });

  bot.on(Events.WebhooksUpdate, async (canal) => {
    const ejecutor = await obtenerEjecutor(canal.guild, AuditLogEvent.WebhookUpdate, canal.id);
    await logPara(bot, canal.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xffa657)
          .setDescription(`🔗 Webhook(s) modificados en <#${canal.id}>${ejecutor ? `\n🙋 Quién: <@${ejecutor.id}>` : ''}`),
      ],
    });
  });

  bot.on(Events.ThreadCreate, async (hilo) => {
    if (hilo.joinable && !hilo.joined) {
      try { await hilo.join(); } catch {}
    }
    const ejecutor = await obtenerEjecutor(hilo.guild, AuditLogEvent.ThreadCreate, hilo.id);
    await logPara(bot, hilo.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(`🧵 Hilo creado: **${hilo.name}** (<#${hilo.id}>)${ejecutor ? `\n🙋 Quién: <@${ejecutor.id}>` : ''}`),
      ],
    });
  });

  bot.on(Events.ThreadDelete, async (hilo) => {
    await logPara(bot, hilo.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription(`🧵 Hilo borrado: **${hilo.name}**`),
      ],
    });
  });

  bot.on(Events.ThreadUpdate, async (antesH, nuevoH) => {
    const cambios = [];
    if (antesH.name !== nuevoH.name) cambios.push(`🏷️ **${antesH.name}** → **${nuevoH.name}**`);
    if (antesH.archived !== nuevoH.archived) cambios.push(`📦 Archivado: ${nuevoH.archived ? 'sí' : 'no'}`);
    if (antesH.locked !== nuevoH.locked) cambios.push(`🔒 Bloqueado: ${nuevoH.locked ? 'sí' : 'no'}`);
    if (antesH.autoArchiveDuration !== nuevoH.autoArchiveDuration) cambios.push(`⏱️ Autoarchivado: ${nuevoH.autoArchiveDuration} min`);
    if (!cambios.length) return;
    await logPara(bot, nuevoH.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xffa657)
          .setDescription(`⚙️ Hilo <#${nuevoH.id}> actualizado\n${cambios.join('\n')}`),
      ],
    });
  });

  bot.on(Events.GuildScheduledEventCreate, async (evento) => {
    await logPara(bot, evento.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(`📅 Evento programado creado: **${evento.name}** <t:${Math.floor(evento.scheduledStartTimestamp / 1000)}:F>`),
      ],
    });
  });

  bot.on(Events.GuildScheduledEventDelete, async (evento) => {
    await logPara(bot, evento.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription(`🗑️ Evento programado borrado: **${evento.name}**`),
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

  bot.on(Events.ShardsAll, () => {
    for (const guild of bot.guilds.cache.values()) {
      alertaDe(bot, guild, '✅ **El bot se ha reconectado a Discord.**', 0x57f287, '📡 Estado del bot');
    }
  });

  bot.on(Events.ShardDisconnect, (evento, id) => {
    for (const guild of bot.guilds.cache.values()) {
      alertaDe(bot, guild, `⚠️ **El shard ${id} se ha desconectado.**${evento.code ? `\nCódigo: \`${evento.code}\`` : ''}`, 0xfee75c, '📡 Estado del bot');
    }
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