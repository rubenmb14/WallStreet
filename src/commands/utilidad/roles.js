const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roles')
    .setDescription('Muestra todos los roles del servidor con su ID'),

  async execute(interaction) {
    const { guild } = interaction;
    const roles = [...guild.roles.cache.values()]
      .sort((a, b) => b.position - a.position)
      .filter((r) => r.name !== '@everyone')
      .map((r) => `${r} \`${r.id}\``)
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`Roles de ${guild.name} (${guild.roles.cache.size - 1})`)
      .setColor(0x5865f2)
      .setDescription(roles || 'No hay roles.');

    await interaction.reply({ embeds: [embed] });
  },
};