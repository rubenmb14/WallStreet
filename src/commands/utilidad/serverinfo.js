const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Muestra información del servidor'),
  async execute(interaction) {
    const { guild } = interaction;

    const embed = new EmbedBuilder()
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .setColor(0x5865f2)
      .addFields(
        { name: '👑 Dueño', value: `<@${guild.ownerId}>`, inline: true },
        { name: '👥 Miembros', value: `${guild.memberCount}`, inline: true },
        { name: '#️⃣ Canales', value: `${guild.channels.cache.size}`, inline: true },
        { name: '🏷️ Roles', value: `${guild.roles.cache.size}`, inline: true },
        { name: '😀 Emojis', value: `${guild.emojis.cache.size}`, inline: true },
        { name: '📅 Creado el', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true }
      );

    await interaction.reply({ embeds: [embed] });
  },
};