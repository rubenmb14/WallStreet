const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Desbanea a un usuario usando su ID')
    .addStringOption((opcion) =>
      opcion.setName('id').setDescription('ID del usuario a desbanear').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  async execute(interaction) {
    const id = interaction.options.getString('id', true);
    try {
      const usuario = await interaction.guild.bans.remove(id);
      await interaction.reply(`✅ **${usuario?.tag ?? id}** fue desbaneado.`);
    } catch {
      await interaction.reply({
        content: 'No pude desbanear. Verifica que el ID sea correcto y que el usuario esté baneado.',
        ephemeral: true,
      });
    }
  },
};