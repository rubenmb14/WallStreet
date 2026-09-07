const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const NUMEROS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('encuesta')
    .setDescription('Crea una encuesta con reacciones')
    .addStringOption((opcion) =>
      opcion.setName('pregunta').setDescription('Pregunta de la encuesta').setRequired(true)
    )
    .addStringOption((opcion) =>
      opcion.setName('opciones').setDescription('Opciones separadas por | (ej: Sí | No | Quizá)')
    ),
  async execute(interaction) {
    const pregunta = interaction.options.getString('pregunta', true);
    const opcionesTexto = interaction.options.getString('opciones');

    if (!opcionesTexto) {
      const mensaje = await interaction.reply({ content: `📊 **${pregunta}**`, fetchReply: true });
      await mensaje.react('👍');
      await mensaje.react('👎');
      return;
    }

    const opciones = opcionesTexto.split('|').map((x) => x.trim()).filter(Boolean);
    if (opciones.length < 2 || opciones.length > NUMEROS.length) {
      return interaction.reply({ content: `Debes dar entre 2 y ${NUMEROS.length} opciones separadas por |`, flags: MessageFlags.Ephemeral });
    }

    const cuerpo = opciones.map((op, i) => `${NUMEROS[i]} ${op}`).join('\n\n');
    const mensaje = await interaction.reply({ content: `📊 **${pregunta}**\n\n${cuerpo}`, fetchReply: true });
    for (let i = 0; i < opciones.length; i++) {
      await mensaje.react(NUMEROS[i]);
    }
  },
};