const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Muestra información de un usuario')
    .addUserOption((opcion) =>
      opcion.setName('usuario').setDescription('Usuario a consultar (vacío = tú)')
    ),
  async execute(interaction) {
    const usuario = interaction.options.getUser('usuario') ?? interaction.user;
    const miembro = await interaction.guild.members.fetch(usuario.id).catch(() => null);
    const roles = miembro
      ? miembro.roles.cache
          .filter((r) => r.name !== '@everyone')
          .sort((a, b) => b.position - a.position)
          .map((r) => r.toString())
          .slice(0, 10)
          .join(' ') || 'Sin roles'
      : 'No está en este servidor';

    const embed = new EmbedBuilder()
      .setTitle(usuario.tag)
      .setThumbnail(usuario.displayAvatarURL({ size: 256 }))
      .setColor(miembro?.displayColor || 0x5865f2)
      .addFields(
        { name: '🆔 ID', value: usuario.id, inline: true },
        { name: '🤖 ¿Bot?', value: usuario.bot ? 'Sí' : 'No', inline: true },
        { name: '📅 Cuenta creada', value: `<t:${Math.floor(usuario.createdTimestamp / 1000)}:D>`, inline: true }
      );

    if (miembro) {
      embed.addFields({ name: '📥 Entró al servidor', value: `<t:${Math.floor(miembro.joinedTimestamp / 1000)}:D>`, inline: true });
    }
    embed.addFields({ name: '🏷️ Roles', value: roles });

    await interaction.reply({ embeds: [embed] });
  },
};