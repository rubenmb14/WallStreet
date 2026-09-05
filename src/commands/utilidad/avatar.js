const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Muestra el avatar de un usuario en grande')
    .addUserOption((opcion) =>
      opcion.setName('usuario').setDescription('Usuario a consultar (vacío = tú)')
    ),
  async execute(interaction) {
    const usuario = interaction.options.getUser('usuario') ?? interaction.user;
    await interaction.reply(`🖼️ Avatar de **${usuario.tag}**:\n${usuario.displayAvatarURL({ size: 1024 })}`);
  },
};