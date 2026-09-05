const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const MAX = 4096;

function trocear(texto, size) {
  const partes = [];
  let actual = '';
  for (const linea of texto.split('\n')) {
    if ((actual + linea + '\n').length > size) {
      partes.push(actual.trimEnd());
      actual = '';
    }
    actual += linea + '\n';
  }
  if (actual.trim()) partes.push(actual.trimEnd());
  return partes;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roles')
    .setDescription('Muestra todos los roles del servidor con su ID'),

  async execute(interaction) {
    const { guild } = interaction;
    const lista = [...guild.roles.cache.values()]
      .filter((r) => r.name !== '@everyone')
      .sort((a, b) => b.position - a.position || (BigInt(a.id) > BigInt(b.id) ? -1 : 1))
      .map((r) => `${r} \`${r.id}\``)
      .join('\n') || 'No hay roles.';

    const partes = trocear(lista, MAX);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`Roles de ${guild.name} (${guild.roles.cache.size - 1})`)
          .setColor(0x5865f2)
          .setDescription(partes[0]),
      ],
    });

    for (const parte of partes.slice(1)) {
      await interaction.channel.send({
        embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription(parte)],
      });
    }
  },
};