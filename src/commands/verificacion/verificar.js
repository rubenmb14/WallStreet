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
    .setDescription('Completa tu registro: elige tu rango y escribe tu nombre'),

  async execute(interaction) {
    const rangos = Object.keys(CONFIG.rangos);

    if (rangos.length === 0) {
      return interaction.reply({ content: 'Aún no hay rangos configurados en config.json.', ephemeral: true });
    }
    if (rangos.length > 25) {
      return interaction.reply({ content: 'Hay más de 25 rangos configurados; deja 25 o menos y separa los cargos por rol.', ephemeral: true });
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

    const rango = new StringSelectMenuBuilder()
      .setCustomId('rango')
      .setPlaceholder('Selecciona tu rango')
      .addOptions(
        rangos.map((nombreRango) =>
          new StringSelectMenuOptionBuilder().setLabel(nombreRango).setValue(nombreRango)
        )
      );

    modal.addComponents(
      new ActionRowBuilder().addComponents(nombre),
      new ActionRowBuilder().addComponents(rango)
    );

    await interaction.showModal(modal);
  },
};