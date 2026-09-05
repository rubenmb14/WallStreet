const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulsa a un usuario del servidor')
    .addUserOption((opcion) =>
      opcion.setName('usuario').setDescription('Usuario a expulsar').setRequired(true)
    )
    .addStringOption((opcion) =>
      opcion.setName('razon').setDescription('Motivo de la expulsión')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  async execute(interaction) {
    const usuario = interaction.options.getUser('usuario', true);
    const razon = interaction.options.getString('razon') ?? 'Sin motivo especificado';
    const miembro = await interaction.guild.members.fetch(usuario.id).catch(() => null);

    if (!miembro) {
      return interaction.reply({ content: 'No encontré a ese usuario en el servidor.', ephemeral: true });
    }
    if (!miembro.kickable) {
      return interaction.reply({ content: 'No puedo expulsarlo: tiene un rol superior al mío o es el dueño.', ephemeral: true });
    }

    await miembro.kick(razon);
    await interaction.reply(`👢 **${usuario.tag}** fue expulsado.\n**Motivo:** ${razon}`);
  },
};