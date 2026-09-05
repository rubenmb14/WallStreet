const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Publica el mensaje de verificación con el botón Verificar'),

  async execute(interaction) {
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

    await interaction.reply({ embeds: [embed], components: [fila] });
  },
};