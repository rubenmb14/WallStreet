require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const logger = require('./logger');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.commands = new Collection();
client.config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

function configDe(guildId) {
  return (client.config.servidores || {})[guildId] || {};
}
client.configDe = configDe;

async function enviarAlerta(guild, mensaje, color = 0xed4245, autor = '⚠️ Alerta del bot') {
  if (!guild) return;
  const config = configDe(guild.id);
  if (!config.canalAlertas) return;
  const canal = guild.channels.cache.get(config.canalAlertas);
  if (!canal?.isTextBased()) return;
  try {
    await canal.send({
      embeds: [
        new EmbedBuilder()
          .setColor(color)
          .setAuthor({ name: autor })
          .setDescription(mensaje)
          .setTimestamp(),
      ],
    });
  } catch {}
}
client.enviarAlerta = enviarAlerta;

const ARCHIVO_REVISION = path.join(__dirname, 'revision.json');
let verificacionesPendientes = {};
try {
  verificacionesPendientes = JSON.parse(fs.readFileSync(ARCHIVO_REVISION, 'utf8'));
} catch {
  verificacionesPendientes = {};
}

function guardarRevisiones() {
  fs.writeFileSync(ARCHIVO_REVISION, JSON.stringify(verificacionesPendientes, null, 2));
}

const ARCHIVO_CHANGELOG = path.join(__dirname, 'CHANGELOG.md');
const ARCHIVO_NOTIFICADO = path.join(__dirname, 'changelog_notificado.json');
let changelogNotificadas = [];
try {
  changelogNotificadas = JSON.parse(fs.readFileSync(ARCHIVO_NOTIFICADO, 'utf8')).notificadas || [];
} catch {
  changelogNotificadas = [];
}

function seccionesChangelog() {
  if (!fs.existsSync(ARCHIVO_CHANGELOG)) return [];
  const secciones = [];
  let actual = null;
  for (const linea of fs.readFileSync(ARCHIVO_CHANGELOG, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^##\s+(.+)$/);
    if (m) {
      actual = { titulo: m[1].trim(), contenido: [] };
      secciones.push(actual);
    } else if (actual) {
      actual.contenido.push(linea);
    }
  }
  return secciones.filter((s) => s.contenido.some((l) => l.trim()));
}

async function notificarCambios(c) {
  const uid = client.config.dmCambiosUserId;
  if (!uid) return;
  const secciones = seccionesChangelog();
  const nuevas = secciones.filter((s) => !changelogNotificadas.includes(s.titulo));
  if (!nuevas.length) return;
  try {
    const usuario = await c.users.fetch(uid);
    for (const s of nuevas) {
      await usuario.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`📢 ${s.titulo}`)
            .setDescription(s.contenido.map((l) => l.trim()).filter(Boolean).join('\n')),
        ],
      });
    }
    changelogNotificadas = changelogNotificadas.concat(nuevas.map((s) => s.titulo));
    fs.writeFileSync(ARCHIVO_NOTIFICADO, JSON.stringify({ notificadas: changelogNotificadas }, null, 2));
  } catch (error) {
    console.error('No pude notificar cambios por MD:', error.message);
  }
}

function esPersonal(miembro, config) {
  if (!miembro) return false;
  if (miembro.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return (config.rolesStaff || []).some((id) => miembro.roles.cache.has(id));
}

function cargarComandos(dir) {
  const archivos = fs.readdirSync(dir);
  for (const archivo of archivos) {
    const ruta = path.join(dir, archivo);
    if (fs.statSync(ruta).isDirectory()) {
      cargarComandos(ruta);
    } else if (archivo.endsWith('.js')) {
      const comando = require(ruta);
      if ('data' in comando && 'execute' in comando) {
        client.commands.set(comando.data.name, comando);
      }
    }
  }
}

cargarComandos(path.join(__dirname, 'src', 'commands'));
logger.initLogger(client);

function construirSetup() {
  const embed = new EmbedBuilder()
    .setTitle('🏦 WallStreet')
    .setDescription('Verificate para solicitar permisos')
    .setColor(0x5865f2);

  const fila = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verificar_boton')
      .setLabel('Verificar')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('✅')
  );

  return { embeds: [embed], components: [fila] };
}

const TITULO_LISTA_COMANDOS = '📜 Comandos del bot';
const MARCA_LISTA_COMANDOS = 'ComandosStaff v2';

function construirListaComandos() {
  const embed = new EmbedBuilder()
    .setTitle(TITULO_LISTA_COMANDOS)
    .setDescription('Comandos disponibles del bot WallStreet.')
    .setColor(0x5865f2)
    .addFields(
      {
        name: '🔨 Moderación',
        value: [
          '**/ban** — Banea a un usuario (opcional: días de mensajes a borrar y motivo).',
          '**/unban** — Desbanea a un usuario introduciendo su ID.',
          '**/kick** — Expulsa a un miembro del servidor (con motivo).',
          '**/timeout** — Silencia a un usuario temporalmente (minutos, máx. 28 días).',
          '**/clear** — Borra mensajes recientes del canal (1-100, solo en canales permitidos).',
        ].join('\n'),
        inline: false,
      },
      {
        name: '🛡️ Verificación',
        value: [
          '**/setup** — Publica el mensaje con el botón Verificar.',
          '**/verificar** — Inicia el flujo de verificación (nombre → rango → equipo). En la práctica la gente usa el botón, no el comando.',
        ].join('\n'),
        inline: false,
      },
      {
        name: '🧰 Utilidad',
        value: [
          '**/anuncio** — El personal publica un mensaje en el canal y lo envía por privado a todo un equipo (WSB/WSD/WSO/WSA).',
          '**/roles** — Lista de roles del servidor (paginada).',
          '**/historial** — Historial de actividad que el bot guarda de un usuario (filtrable por período).',
          '**/avatar** — Avatar de un usuario en grande.',
          '**/userinfo** — Info de un usuario: ID, si es bot, cuándo se creó, cuándo entró y sus roles.',
          '**/serverinfo** — Info del servidor: dueño, miembros, canales, roles, emojis y fecha de creación.',
          '**/encuesta** — Crea una encuesta con reacciones (ej. `Sí | No | Quizá`).',
        ].join('\n'),
        inline: false,
      }
    )
    .setFooter({ text: MARCA_LISTA_COMANDOS });

  return { embeds: [embed] };
}

async function publicarListaComandosEn(guild) {
  const config = configDe(guild.id);
  if (!config.canalComandosLista) return;

  const canal = guild.channels.cache.get(config.canalComandosLista);
  if (!canal?.isTextBased()) return;

  try {
    const mensajes = await canal.messages.fetch({ limit: 20 });
    const yaExiste = mensajes.some(
      (m) =>
        m.author.id === client.user.id &&
        m.embeds.some((e) => e.footer?.text === MARCA_LISTA_COMANDOS)
    );
    if (yaExiste) return;
  } catch (error) {
    console.error(`No pude revisar la lista de comandos en ${guild.name}:`, error.message);
    return;
  }

  try {
    await canal.send(construirListaComandos());
  } catch (error) {
    console.error(`No pude publicar la lista de comandos en ${guild.name}:`, error.message);
  }
}

async function publicarSetupEn(guild) {
  const config = configDe(guild.id);
  if (!config.canalVerificar) return;

  const canal = guild.channels.cache.get(config.canalVerificar);
  if (!canal?.isTextBased()) return;

  try {
    const mensajes = await canal.messages.fetch({ limit: 20 });
    const yaExiste = mensajes.some(
      (m) =>
        m.author.id === client.user.id &&
        (m.components.some((fila) => fila.components.some((c) => c.customId === 'verificar_boton')))
    );
    if (yaExiste) return;
  } catch (error) {
    console.error(`No pude revisar el setup en ${guild.name}:`, error.message);
    return;
  }

  try {
    await canal.send(construirSetup());
  } catch (error) {
    console.error(`No pude publicar el setup en ${guild.name}:`, error.message);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`WallStreet conectado como ${c.user.tag}`);
  c.user.setActivity('registrando miembros');
  try {
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    const cuerpo = client.commands.map((comando) => {
      if (!comando.permisoManual) {
        comando.data.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
      }
      return comando.data.toJSON();
    });
    for (const guild of c.guilds.cache.values()) {
      await rest.put(Routes.applicationGuildCommands(c.application.id, guild.id), { body: cuerpo });
      console.log(`Comandos registrados en ${guild.name} (${guild.id}).`);
    }
    console.log(`${client.commands.size} comandos por servidor.`);
  } catch (error) {
    console.error('Error al registrar los comandos:', error);
    for (const guild of c.guilds.cache.values()) {
      await enviarAlerta(guild, `⚠️ **Error al registrar los comandos:**\n\`\`\`${String(error.message || error).slice(0, 500)}\`\`\``, 0xed4245, '🛑 Error');
    }
  }

  for (const guild of c.guilds.cache.values()) {
    await publicarSetupEn(guild);
    await publicarListaComandosEn(guild);
  }
  console.log('Setups publicados en los servidores configurados.');

  for (const guild of c.guilds.cache.values()) {
    await enviarAlerta(
      guild,
      '✅ **El bot se ha iniciado correctamente.** Sistema de logs y alertas activos.',
      0x57f287,
      '🚀 Estado del bot'
    );
  }

  await notificarCambios(c);
});

client.on(Events.GuildMemberAdd, async (miembro) => {
  if (miembro.user.bot) return;

  const config = configDe(miembro.guild.id);
  const mensajeBase = config.mensajeBienvenida || client.config.mensajeBienvenida;

  if (config.rolSinVerificar && miembro.guild.roles.cache.has(config.rolSinVerificar)) {
    try {
      await miembro.roles.add(config.rolSinVerificar);
    } catch {}
  }

  const canal = config.canalBienvenidas
    ? miembro.guild.channels.cache.get(config.canalBienvenidas)
    : null;

  if (canal?.isTextBased()) {
    canal.send(mensajeBase.replace('{mention}', miembro.toString()).replace('{server}', miembro.guild.name)).catch(() => {});
  }

  if (client.config.autoDmAlUnirse) {
    miembro
      .send(mensajeBase.replace('{mention}', `<@${miembro.user.id}>`).replace('{server}', miembro.guild.name))
      .catch(() => {});
  }
});

const pendientesPorUsuario = new Map();

function construirSelectRoles(config) {
  const opciones = Object.entries(config.rangos || {})
    .filter(([, id]) => id)
    .map(([label, id]) => new StringSelectMenuOptionBuilder().setLabel(label).setValue(id));

  const select = new StringSelectMenuBuilder()
    .setCustomId('verificar_roles')
    .setPlaceholder('¿Cuál es tu rango en WallStreet?')
    .setMinValues(1)
    .addOptions(opciones);

  return new ActionRowBuilder().addComponents(select);
}

function construirSelectEquipos(config) {
  const opciones = Object.entries(config.equipos || {})
    .filter(([, id]) => id)
    .map(([label, id]) => new StringSelectMenuOptionBuilder().setLabel(label).setValue(id));

  const select = new StringSelectMenuBuilder()
    .setCustomId('verificar_equipo')
    .setPlaceholder('¿En qué equipo estás?')
    .setMinValues(1)
    .addOptions(opciones);

  return new ActionRowBuilder().addComponents(select);
}

async function manejarVerificacion(interaction) {
  const config = configDe(interaction.guildId);
  const canalVerificar = interaction.guild.channels.cache.get(config.canalVerificar);

  if (!config.canalVerificar || interaction.channelId !== config.canalVerificar) {
    return interaction.reply({
      content: `Solo puedes usar /verificar en ${canalVerificar ? canalVerificar.toString() : 'el canal de verificación de este servidor'}.`,
      ephemeral: true,
    });
  }

  const nombre = interaction.fields.getTextInputValue('nombre').trim();

  pendientesPorUsuario.set(`${interaction.guildId}:${interaction.user.id}`, { nombre });

  await interaction.reply({
    content: '📋 Marca los roles que te corresponden:',
    components: [construirSelectRoles(config)],
    ephemeral: true,
  });
}

async function manejarSeleccionRoles(interaction) {
  const config = configDe(interaction.guildId);
  const canalVerificar = interaction.guild.channels.cache.get(config.canalVerificar);

  if (!config.canalVerificar || interaction.channelId !== config.canalVerificar) {
    return interaction.update({
      content: `Solo puedes usar esto en ${canalVerificar ? canalVerificar.toString() : 'el canal de verificación de este servidor'}.`,
      components: [],
    });
  }

  const pendiente = pendientesPorUsuario.get(`${interaction.guildId}:${interaction.user.id}`);
  if (!pendiente) {
    return interaction.update({
      content: 'Esta solicitud ya caducó. Vuelve a usar /verificar.',
      components: [],
    });
  }

  const rolesMarcados = interaction.values || [];
  if (!rolesMarcados.length) {
    return interaction.update({
      content: 'Marca al menos un rol.',
      components: [construirSelectRoles(config)],
    });
  }

  const clave = `${interaction.guildId}:${interaction.user.id}`;
  pendiente.rango = rolesMarcados;

  if (config.equipos && Object.keys(config.equipos).length) {
    return interaction.update({
      content: '🏟️ ¿En qué equipo de WallStreet estás?',
      components: [construirSelectEquipos(config)],
    });
  }

  await enviarSolicitud(interaction, config, clave, pendiente, rolesMarcados);
}

async function manejarSeleccionEquipo(interaction) {
  const config = configDe(interaction.guildId);

  const clave = `${interaction.guildId}:${interaction.user.id}`;
  const pendiente = pendientesPorUsuario.get(clave);
  if (!pendiente) {
    return interaction.update({
      content: 'Esta solicitud ya caducó. Vuelve a usar /verificar.',
      components: [],
    });
  }

  const equiposMarcados = interaction.values || [];
  if (!equiposMarcados.length) {
    return interaction.update({
      content: 'Selecciona tu equipo.',
      components: [construirSelectEquipos(config)],
    });
  }

  const rolesFinales = [...(pendiente.rango || []), ...equiposMarcados];
  await enviarSolicitud(interaction, config, clave, pendiente, rolesFinales);
}

async function enviarSolicitud(interaction, config, clave, pendiente, rolesMarcados) {
  const canalRevision = interaction.guild.channels.cache.get(config.canalRevision);
  if (!config.canalRevision || !canalRevision?.isTextBased()) {
    return interaction.update({
      content: 'Este servidor aún no tiene configurado el canal de revisión. Avisa al staff.',
      components: [],
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('📝 Solicitud de verificación')
    .setColor(0x5865f2)
    .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '👤 Usuario', value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: true },
      { name: '✏️ Nombre', value: pendiente.nombre, inline: true },
      { name: '🎖️ Roles solicitados', value: rolesMarcados.map((id) => `<@&${id}>`).join(' '), inline: false },
      { name: '🕐 Enviado', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
    );

  const filaBotones = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('verif_aceptar').setLabel('Aceptar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('verif_denegar').setLabel('Denegar').setStyle(ButtonStyle.Danger)
  );

  const mensaje = await canalRevision.send({ embeds: [embed], components: [filaBotones] });

  verificacionesPendientes[mensaje.id] = {
    guildId: interaction.guildId,
    canalRevision: canalRevision.id,
    userId: interaction.user.id,
    nombre: pendiente.nombre,
    roles: rolesMarcados,
  };
  guardarRevisiones();

  pendientesPorUsuario.delete(clave);

  await interaction.update({
    content: '✅ Tu solicitud se ha enviado. Un responsable la revisará y, si la acepta, recibirás tu rol.',
    components: [],
  });
}

async function manejarRevision(interaction) {
  const registro = verificacionesPendientes[interaction.message.id];

  if (!registro) {
    return interaction.reply({ content: 'Esta solicitud ya fue resuelta.', ephemeral: true });
  }

  const config = configDe(registro.guildId);

  if (!esPersonal(interaction.member, config) && !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({ content: 'No tienes permiso para decidir sobre esta solicitud.', ephemeral: true });
  }

  const esAceptar = interaction.customId === 'verif_aceptar';

  delete verificacionesPendientes[interaction.message.id];
  guardarRevisiones();

  const embedOriginal = interaction.message.embeds[0];
  const embedFinal = EmbedBuilder.from(embedOriginal)
    .setColor(esAceptar ? 0x57f287 : 0xed4245)
    .addFields({
      name: '⚖️ Decisión',
      value: esAceptar ? `✅ Aceptada por <@${interaction.user.id}>` : `❌ Denegada por <@${interaction.user.id}>`,
      inline: false,
    });
  await interaction.message.edit({ embeds: [embedFinal], components: [] });

  const miembro = await interaction.guild.members.fetch(registro.userId).catch(() => null);

  logger.registrarEvento(
    interaction.guildId,
    registro.userId,
    esAceptar ? 'verificacion' : 'verificacion_denegada',
    esAceptar
      ? `Verificado por <@${interaction.user.id}> (roles: ${registro.roles.length})`
      : `Verificación denegada por <@${interaction.user.id}>`
  );

  if (esAceptar) {
    const avisos = [];
    const botMiembro = interaction.guild.members.me;
    const tieneGestionarApodos = botMiembro?.permissions.has(PermissionFlagsBits.ManageNicknames);

    if (!tieneGestionarApodos) {
      avisos.push('El bot necesita el permiso **Gestionar apodos** (Manage Nicknames) para cambiar el nombre.');
    }

    if (miembro) {
      const posicionBot = botMiembro?.roles.highest.position ?? 0;
      const posicionMiembro = miembro.roles.highest.position ?? 0;
      if (posicionMiembro >= posicionBot) {
        avisos.push('El rol del bot debe estar **por encima** del rol más alto de este usuario para cambiarle el apodo.');
      }
      try {
        await miembro.setNickname(registro.nombre);
      } catch {
        avisos.push('No pude cambiar el apodo del usuario.');
      }
      const rolesExistentes = registro.roles.filter((id) => interaction.guild.roles.cache.has(id));
      const rolesAAsignar = [...rolesExistentes];
      if (config.rolVerificado && interaction.guild.roles.cache.has(config.rolVerificado)) {
        rolesAAsignar.push(config.rolVerificado);
      }
      if (rolesAAsignar.length) {
        try {
          await miembro.roles.add(rolesAAsignar);
        } catch {
          avisos.push('No pude asignar los roles.');
        }
      }
      if (config.rolSinVerificar && miembro.roles.cache.has(config.rolSinVerificar)) {
        try {
          await miembro.roles.remove(config.rolSinVerificar);
        } catch {
          avisos.push('No pude quitar el rol de sin verificar.');
        }
      }
      miembro
        .send(`✅ ¡Tu verificación fue **aceptada** en ${interaction.guild.name}! Tu rol ha sido asignado. Aceptado por <@${interaction.user.id}>${avisos.length ? `\n⚠️ ${avisos.join('\n⚠️ ')}` : ''}`)
        .catch(() => {});
    }

    await interaction.reply({
      content: `✅ Solicitud aceptada.${avisos.length ? `\n⚠️ ${avisos.join('\n⚠️ ')}` : '\nEl miembro ya tiene su rol.'}`,
      ephemeral: true,
    });
  } else {
    if (miembro) {
      miembro
        .send(`❌ Tu verificación fue **denegada** en ${interaction.guild.name}. Denegado por <@${interaction.user.id}>`)
        .catch(() => {});
    }
    await interaction.reply({ content: '❌ Solicitud denegada.', ephemeral: true });
  }
}


client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const comando = client.commands.get(interaction.commandName);
    if (!comando) return;

    const config = configDe(interaction.guildId);

    if (interaction.channelId === config.canalVerificar && interaction.commandName !== 'verificar' && interaction.commandName !== 'setup') {
      return interaction.reply({ content: 'En este canal solo puedes usar /verificar y /setup.', ephemeral: true });
    }

    if (interaction.commandName !== 'verificar' && !esPersonal(interaction.member, config)) {
      return interaction.reply({ content: 'No tienes permiso para usar este comando.', ephemeral: true });
    }

    try {
      await comando.execute(interaction);
    } catch (error) {
      console.error(error);
      const respuesta = { content: 'Hubo un error al ejecutar este comando.', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(respuesta);
      } else {
        await interaction.reply(respuesta);
      }
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'verificar_modal') {
    await manejarVerificacion(interaction);
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'verificar_roles') {
    await manejarSeleccionRoles(interaction);
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'verificar_equipo') {
    await manejarSeleccionEquipo(interaction);
    return;
  }

  if (interaction.isButton() && (interaction.customId === 'verif_aceptar' || interaction.customId === 'verif_denegar')) {
    await manejarRevision(interaction);
    return;
  }

  if (interaction.isButton() && interaction.customId === 'verificar_boton') {
    const config = configDe(interaction.guildId);

    if (!config.canalVerificar || interaction.channelId !== config.canalVerificar) {
      const canal = interaction.guild.channels.cache.get(config.canalVerificar);
      return interaction.reply({
        content: `Solo puedes verificarte en ${canal ? canal.toString() : 'el canal de verificación de este servidor'}. Usa /verificar ahí.`,
        ephemeral: true,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('verificar_modal')
      .setTitle('Verificación de miembro');

    const nombre = new TextInputBuilder()
      .setCustomId('nombre')
      .setLabel('¿Cómo te llamas? (será tu apodo)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(32);

    modal.addComponents(new ActionRowBuilder().addComponents(nombre));

    await interaction.showModal(modal);
    return;
  }
});

client.login(process.env.DISCORD_TOKEN);
