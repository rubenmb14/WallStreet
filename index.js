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

async function manejarVerificacion(interaction) {
  const { config } = client;
  const nombre = interaction.fields.getTextInputValue('nombre').trim();
  const rango = interaction.fields.getSelectMenuValues('rango')[0];
  const rolId = config.rangos[rango];

  if (!rango) {
    return interaction.reply({ content: 'No seleccionaste ningún rango.', ephemeral: true });
  }

  const rol = rolId
    ? interaction.guild.roles.cache.get(rolId)
    : interaction.guild.roles.cache.find((r) => r.name === rango);

  if (!rol) {
    return interaction.reply({
      content: `No encontré el rol **"${rango}"** en este servidor. Edita la sección "rangos" de \`config.json\` con el nombre o el ID correctos del rol. Usa \`/roles\` para verlos.`,
      ephemeral: true,
    });
  }

  const apodo = config.apodoConRango ? `${rango} ${nombre}` : nombre;
  const miembro = await interaction.member.fetch().catch(() => null);
  if (!miembro) return;

  const avisos = [];

  try {
    if (miembro.nickname !== apodo) {
      await miembro.setNickname(apodo);
    }
  } catch {
    avisos.push('No pude cambiar tu apodo (mira mis permisos o la jerarquía de roles).');
  }

  if (!miembro.roles.cache.has(rol.id)) {
    try {
      await miembro.roles.add(rol);
    } catch {
      avisos.push(`No pude asignarte el rol **${rol.name}** (revisa mis permisos).`);
    }
  }

  const partes = [`✅ ¡Verificado! Apodo: **${apodo}**`, `🎖️ Rol: **${rol.name}**`];
  if (avisos.length) partes.push(...avisos);
  await interaction.reply({ content: partes.join('\n'), ephemeral: true });
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const comando = client.commands.get(interaction.commandName);
    if (!comando) return;

    const esStaff =
      interaction.member?.permissions.has(PermissionFlagsBits.Administrator) ||
      (client.config.rolesStaff || []).some((id) => interaction.member?.roles.cache.has(id));

    if (interaction.commandName !== 'verificar' && !esStaff) {
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
  }
});

client.login(process.env.DISCORD_TOKEN);