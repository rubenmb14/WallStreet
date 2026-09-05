const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
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

    const rangos = Object.entries(CONFIG.rangos).filter(([, id]) => id);

    if (rangos.length === 0) {
      return interaction.reply({ content: 'Aún no hay roles configurados en config.json.', ephemeral: true });
    }
    if (rangos.length > 25) {
      return interaction.reply({ content: 'Hay más de 25 roles configurados; deja 25 o menos.', ephemeral: true });
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

    const roles = new StringSelectMenuBuilder()
      .setCustomId('roles')
      .setPlaceholder('Marca los roles que te corresponden')
      .setMinValues(1)
      .addOptions(
        rangos.map(([nombreRango, id]) =>
          new StringSelectMenuOptionBuilder().setLabel(nombreRango).setValue(id)
        )
      );

    modal.addComponents(
      new ActionRowBuilder().addComponents(nombre),
      new ActionRowBuilder().addComponents(roles)
    );

    await interaction.showModal(modal);
  },
};