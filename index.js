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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();
client.config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

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

client.once(Events.ClientReady, async (c) => {
  console.log(`WallStreet conectado como ${c.user.tag}`);
  c.user.setActivity('registrando miembros');
  try {
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationGuildCommands(c.application.id, process.env.GUILD_ID), {
      body: client.commands.map((comando) => comando.data.toJSON()),
    });
    console.log(`${client.commands.size} comandos registrados correctamente.`);
  } catch (error) {
    console.error('Error al registrar los comandos:', error);
  }
});

client.on(Events.GuildMemberAdd, async (miembro) => {
  const { config } = client;
  const canal = config.canalBienvenidas
    ? miembro.guild.channels.cache.get(config.canalBienvenidas)
    : null;

  if (canal?.isTextBased()) {
    const mensaje = (config.mensajeBienvenida || '¡Bienvenido/a {mention}!')
      .replace('{mention}', miembro.toString())
      .replace('{server}', miembro.guild.name);
    canal.send(mensaje).catch(() => {});
  }

  if (config.autoDmAlUnirse) {
    const dm = (config.mensajeBienvenida || '¡Bienvenido/a {mention}!')
      .replace('{mention}', miembro.user.username)
      .replace('{server}', miembro.guild.name)
      .replace(/\/verificar/g, '`/verificar`');
    miembro.send(dm).catch(() => {});
  }
});

const pendientesPorUsuario = new Map();

function construirSelectRoles() {
  const opciones = Object.entries(client.config.rangos)
    .filter(([, id]) => id)
    .map(([label, id]) => new StringSelectMenuOptionBuilder().setLabel(label).setValue(id));

  const select = new StringSelectMenuBuilder()
    .setCustomId('verificar_roles')
    .setPlaceholder('Marca los roles que te corresponden')
    .setMinValues(1)
    .addOptions(opciones);

  return new ActionRowBuilder().addComponents(select);
}

async function manejarVerificacion(interaction) {
  const { config } = client;
  const canalVerificar = interaction.guild.channels.cache.get(config.canalVerificar);

  if (interaction.channelId !== config.canalVerificar) {
    return interaction.reply({
      content: `Solo puedes usar /verificar en ${canalVerificar ? canalVerificar.toString() : 'el canal de verificación'}.`,
      ephemeral: true,
    });
  }

  const nombre = interaction.fields.getTextInputValue('nombre').trim();

  pendientesPorUsuario.set(interaction.user.id, { nombre });

  await interaction.reply({
    content: '📋 Marca los roles que te corresponden:',
    components: [construirSelectRoles()],
    ephemeral: true,
  });
}

async function manejarSeleccionRoles(interaction) {
  const { config } = client;
  const canalVerificar = interaction.guild.channels.cache.get(config.canalVerificar);

  if (interaction.channelId !== config.canalVerificar) {
    return interaction.update({
      content: `Solo puedes usar esto en ${canalVerificar ? canalVerificar.toString() : 'el canal de verificación'}.`,
      components: [],
    });
  }

  const pendiente = pendientesPorUsuario.get(interaction.user.id);
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
      components: [construirSelectRoles()],
    });
  }

  const canalRevision = interaction.guild.channels.cache.get(config.canalRevision);
  if (!canalRevision?.isTextBased()) {
    return interaction.update({
      content: 'Configura el canal de revisión (canalRevision) en config.json.',
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

  pendientesPorUsuario.delete(interaction.user.id);

  await interaction.update({
    content: '✅ Tu solicitud se ha enviado. Un responsable la revisará y, si la acepta, recibirás tu rol.',
    components: [],
  });
}

async function manejarRevision(interaction) {
  const { config } = client;
  const registro = verificacionesPendientes[interaction.message.id];

  if (!esPersonal(interaction.member, config) && !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({ content: 'No tienes permiso para decidir sobre esta solicitud.', ephemeral: true });
  }

  if (!registro) {
    return interaction.reply({ content: 'Esta solicitud ya fue resuelta.', ephemeral: true });
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
      if (rolesExistentes.length) {
        try {
          await miembro.roles.add(rolesExistentes);
        } catch {
          avisos.push('No pude asignar los roles.');
        }
      }
      miembro
        .send(`✅ ¡Tu verificación fue **aceptada** en ${interaction.guild.name}!\nTu rol ha sido asignado.${avisos.length ? `\n⚠️ ${avisos.join('\n⚠️ ')}` : ''}`)
        .catch(() => {});
    }

    await interaction.reply({
      content: `✅ Solicitud aceptada.${avisos.length ? `\n⚠️ ${avisos.join('\n⚠️ ')}` : '\nEl miembro ya tiene su rol.'}`,
      ephemeral: true,
    });
  } else {
    if (miembro) {
      miembro
        .send(`❌ Tu verificación fue **denegada** en ${interaction.guild.name}. Contacta con un responsable.`)
        .catch(() => {});
    }
    await interaction.reply({ content: '❌ Solicitud denegada.', ephemeral: true });
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const comando = client.commands.get(interaction.commandName);
    if (!comando) return;

    if (interaction.channelId === client.config.canalVerificar && interaction.commandName !== 'verificar') {
      return interaction.reply({ content: 'En este canal solo puedes usar /verificar.', ephemeral: true });
    }

    if (interaction.commandName !== 'verificar' && !esPersonal(interaction.member, client.config)) {
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

  if (interaction.isButton() && (interaction.customId === 'verif_aceptar' || interaction.customId === 'verif_denegar')) {
    await manejarRevision(interaction);
    return;
  }

  if (interaction.isButton() && interaction.customId === 'verificar_boton') {
    if (interaction.channelId !== client.config.canalVerificar) {
      const canal = interaction.guild.channels.cache.get(client.config.canalVerificar);
      return interaction.reply({
        content: `Solo puedes verificarte en ${canal ? canal.toString() : 'el canal de verificación'}. Usa /verificar ahí.`,
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