const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const path = require('node:path');

const CONFIG = require(path.join(__dirname, '..', '..', '..', 'config.json'));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verificar')
    .setDescription('Completa tu registro: escribe tu nombre y marca tus roles'),

  async execute(interaction) {
    if (interaction.channelId !== CONFIG.canalVerificar) {
      const canal = interaction.guild.channels.cache.get(CONFIG.canalVerificar);
      return interaction.reply({
        content: `Solo puedes usar /verificar en ${canal ? canal.toString() : 'el canal de verificación'}.`,
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