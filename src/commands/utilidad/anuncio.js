const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { PermissionFlagsBits } = require('discord.js');

const EQUIPOS = [
  { label: '🦬 WSB', value: '1545798733772628091' },
  { label: '🐨 WSD', value: '1545798736419102741' },
  { label: '👾 WSO', value: '1545798738914844703' },
  { label: '🌟 WSA', value: '1545798743503147028' },
];

module.exports = {
  permisoManual: true,

  data: new SlashCommandBuilder()
    .setName('anuncio')
    .setDescription('Publica un mensaje en el canal y lo envía por privado al equipo elegido')
    .addStringOption((o) =>
      o
        .setName('equipo')
        .setDescription('Equipo que recibirá el mensaje por privado')
        .setRequired(true)
        .addChoices(...EQUIPOS.map((e) => ({ name: e.label, value: e.value })))
    )
    .addStringOption((o) =>
      o.setName('mensaje').setDescription('El mensaje a publicar y enviar por privado').setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: '❌ Solo se puede usar dentro del servidor.', flags: MessageFlags.Ephemeral });
    }

    const config = interaction.client.configDe(interaction.guild.id);
    const esAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    const esStaff = (config.rolesStaff || []).some((id) => interaction.member.roles.cache.has(id));

    if (!esAdmin && !esStaff) {
      return interaction.reply({
        content: '❌ No tienes permiso para usar este comando.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const equipoId = interaction.options.getString('equipo');
    const mensaje = interaction.options.getString('mensaje');
    const equipo = EQUIPOS.find((e) => e.value === equipoId);

    await interaction.deferReply();

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({
        name: `${interaction.user.tag}`,
        iconURL: interaction.user.displayAvatarURL({ size: 64 }),
      })
      .setDescription(mensaje)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    await interaction.guild.members.fetch();
    const miembros = interaction.guild.members.cache.filter((m) => m.roles.cache.has(equipoId));
    const rolMencion = `<@&${equipoId}>`;

    let enviados = 0;
    let conMDFallida = 0;

    for (const miembro of miembros.values()) {
      if (miembro.user.bot) continue;
      try {
        await miembro.send({ embeds: [embed] });
        enviados++;
      } catch {
        conMDFallida++;
      }
    }

    await interaction.editReply({
      content: `📨 ${equipo.label} · MD enviada a **${enviados}** miembro(s) con ${rolMencion}` +
        (conMDFallida ? `\n⚠️ **${conMDFallida}** no la recibieron (MDs cerradas).` : ''),
      embeds: [embed],
    });
  },
};