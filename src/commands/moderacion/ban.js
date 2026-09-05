const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Banea a un usuario del servidor')
    .addUserOption((opcion) =>
      opcion.setName('usuario').setDescription('Usuario a banear').setRequired(true)
    )
    .addIntegerOption((opcion) =>
      opcion
        .setName('borrar_mensajes')
        .setDescription('Días de mensajes suyos a borrar (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
    )
    .addStringOption((opcion) =>
      opcion.setName('razon').setDescription('Motivo del baneo')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  async execute(interaction) {
    const usuario = interaction.options.getUser('usuario', true);
    const dias = interaction.options.getInteger('borrar_mensajes') ?? 0;
    const razon = interaction.options.getString('razon') ?? 'Sin motivo especificado';
    const miembro = await interaction.guild.members.fetch(usuario.id).catch(() => null);

    if (miembro && !miembro.bannable) {
      return interaction.reply({ content: 'No puedo banearlo: tiene un rol superior al mío o es el dueño.', ephemeral: true });
    }

    await interaction.guild.members.ban(usuario.id, { reason: razon, deleteMessageSeconds: dias * 86400 });
    await interaction.reply(`🔨 **${usuario.tag}** fue baneado.\n**Motivo:** ${razon}`);
  },
};