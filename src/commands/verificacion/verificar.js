const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verificar')
    .setDescription('Completa tu registro: escribe tu nombre y marca tus roles'),

  async execute(interaction) {
    const config = interaction.client.configDe(interaction.guildId);

    if (!config.canalVerificar || interaction.channelId !== config.canalVerificar) {
      const canal = interaction.guild.channels.cache.get(config.canalVerificar);
      return interaction.reply({
        content: `Solo puedes usar /verificar en ${canal ? canal.toString() : 'el canal de verificación de este servidor'}.`,
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
  },
};