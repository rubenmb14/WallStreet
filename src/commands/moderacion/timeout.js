const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Silencia a un usuario temporalmente')
    .addUserOption((opcion) =>
      opcion.setName('usuario').setDescription('Usuario a silenciar').setRequired(true)
    )
    .addIntegerOption((opcion) =>
      opcion
        .setName('minutos')
        .setDescription('Duración en minutos (máximo 28 días)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320)
    )
    .addStringOption((opcion) =>
      opcion.setName('razon').setDescription('Motivo del silencio')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    const usuario = interaction.options.getUser('usuario', true);
    const minutos = interaction.options.getInteger('minutos', true);
    const razon = interaction.options.getString('razon') ?? 'Sin motivo especificado';
    const miembro = await interaction.guild.members.fetch(usuario.id).catch(() => null);

    if (!miembro) {
      return interaction.reply({ content: 'No encontré a ese usuario en el servidor.', ephemeral: true });
    }
    if (!miembro.moderatable) {
      return interaction.reply({ content: 'No puedo silenciarlo: tiene un rol superior al mío o es el dueño.', ephemeral: true });
    }

    await miembro.timeout(minutos * 60 * 1000, razon);
    await interaction.reply(`🔇 **${usuario.tag}** fue silenciado por **${minutos} minuto(s)**.\n**Motivo:** ${razon}`);
  },
};