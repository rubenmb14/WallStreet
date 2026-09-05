const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reporte')
    .setDescription('Reporta a un usuario o un mensaje al staff')
    .addUserOption((o) =>
      o.setName('usuario').setDescription('El usuario que quieres reportar').setRequired(false)
    )
    .addChannelOption((o) =>
      o.setName('canal').setDescription('El canal donde ocurrió').setRequired(false)
    )
    .addStringOption((o) =>
      o.setName('motivo').setDescription('Explica el motivo del reporte').setRequired(true)
    ),

  async execute(interaction) {
    const config = interaction.client.configDe(interaction.guildId);
    const canal = interaction.guild.channels.cache.get(config.canalReportes);
    if (!config.canalReportes || !canal?.isTextBased()) {
      return interaction.reply({
        content: 'El canal de reportes aún no está configurado por el staff.',
        ephemeral: true,
      });
    }

    const reportado = interaction.options.getUser('usuario');
    const canalMencion = interaction.options.getChannel('canal');
    const motivo = interaction.options.getString('motivo');

    const embed = new EmbedBuilder()
      .setTitle('🚨 Reporte')
      .setColor(0xed4245)
      .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: '📤 Reportado por', value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: true },
        { name: '👤 Usuario reportado', value: reportado ? `<@${reportado.id}> (\`${reportado.id}\`)` : 'No especificado', inline: true },
        { name: '🌐 Canal', value: canalMencion ? `<#${canalMencion.id}>` : 'No especificado', inline: true },
        { name: '📝 Motivo', value: motivo, inline: false }
      )
      .setFooter({ text: `ID del reporte: ${interaction.id}` })
      .setTimestamp();

    const fila = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('reporte_cerrar').setLabel('Cerrar').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('reporte_ban')
        .setLabel('Bannear usuario')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!reportado)
    );

    await canal.send({ embeds: [embed], components: [fila] });
    await interaction.reply({
      content: '✅ Reporte enviado al staff. Gracias por colaborar.',
      ephemeral: true,
    });
  },
};