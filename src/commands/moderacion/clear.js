const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Borra mensajes recientes de este canal')
    .addIntegerOption((opcion) =>
      opcion
        .setName('cantidad')
        .setDescription('Cantidad de mensajes a borrar (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),
  async execute(interaction) {
    const cantidad = interaction.options.getInteger('cantidad', true);

    if (!interaction.channel.bulkDeletable) {
      return interaction.reply({ content: 'No tengo permiso para borrar mensajes en este canal.', ephemeral: true });
    }

    const borrados = await interaction.channel.bulkDelete(cantidad, true);
    await interaction.reply({ content: `🧹 Se borraron **${borrados.size}** mensajes.`, ephemeral: true });
  },
};