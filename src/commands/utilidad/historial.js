const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} = require('discord.js');
const logger = require('../../../logger');

const ETIQUETAS = {
  entrada: '📥 Entrada',
  salida: '📤 Salida',
  expulsion: '👢 Expulsado',
  ban: '🔨 Baneado',
  unban: '🔓 Desbaneado',
  rol: '🎭 Roles',
  apodo: '🏷️ Apodo',
  timeout: '⏳ Timeout',
  comando: '💻 Comando',
  verificacion: '✅ Verificado',
  verificacion_denegada: '❌ Verif. denegada',
};

const DIAS = Object.freeze({
  h24: 1,
  s3: 3,
  s7: 7,
  s30: 30,
  todo: -1,
});

module.exports = {
  data: new SlashCommandBuilder()
    .setName('historial')
    .setDescription('Muestra el historial que el bot registra de un usuario')
    .addUserOption((o) =>
      o.setName('usuario').setDescription('El usuario del que quieres el historial').setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName('periodo')
        .setDescription('Período de fechas a mostrar')
        .setRequired(false)
        .addChoices(
          { name: 'Últimas 24 horas', value: 'h24' },
          { name: 'Últimos 3 días', value: 's3' },
          { name: 'Última semana', value: 's7' },
          { name: 'Último mes', value: 's30' },
          { name: 'Todo', value: 'todo' }
        )
    ),

  async execute(interaction) {
    const objetivo = interaction.options.getUser('usuario');
    const periodo = interaction.options.getString('periodo') || 's30';

    const originales = logger.obtenerHistorialUsuario(interaction.guildId, objetivo.id);
    const limiteDias = DIAS[periodo] ?? 30;

    let eventos = originales;
    if (limiteDias > 0) {
      const corte = Date.now() - limiteDias * 86400000;
      eventos = originales.filter((e) => new Date(e.fecha).getTime() >= corte);
    }

    if (!eventos.length) {
      return interaction.reply({
        content: `No hay eventos registrados de <@${objetivo.id}>${limiteDias > 0 ? ` en los últimos ${limiteDias} días` : ''}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const MAX_PAGINA = 12;
    const paginas = [];
    for (let i = 0; i < eventos.length; i += MAX_PAGINA) {
      paginas.push(eventos.slice(i, i + MAX_PAGINA).reverse());
    }

    const miembraGuild = interaction.guild.members.cache.get(objetivo.id);
    const titulo = `Historial de ${objetivo.username}`;

    function construirEmbed(pagina, indice) {
      const lineas = pagina.map((e) => {
        const etiqueta = ETIQUETAS[e.tipo] || e.tipo;
        const fecha = `<t:${Math.floor(new Date(e.fecha).getTime() / 1000)}:d> <t:${Math.floor(new Date(e.fecha).getTime() / 1000)}:t>`;
        return `**${etiqueta}** — ${fecha}\n${e.detalle}\n`;
      });

      const embed = new EmbedBuilder()
        .setTitle(titulo)
        .setDescription(lineas.join('\n'))
        .setColor(0x5865f2)
        .setFooter({ text: `Página ${indice + 1}/${paginas.length} · ${eventos.length} eventos` });

      if (objetivo.displayAvatarURL()) {
        embed.setThumbnail(objetivo.displayAvatarURL({ size: 128 }));
      }
      if (miembraGuild) {
        embed.addFields({ name: '👤 Miembro', value: `<@${objetivo.id}>`, inline: true });
      }
      return embed;
    }

    if (paginas.length === 1) {
      return interaction.reply({ embeds: [construirEmbed(paginas[0], 0)] });
    }

    let actual = 0;
    const fila = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('historial_pagina')
        .setPlaceholder(`Página ${actual + 1} de ${paginas.length}`)
        .addOptions(
          Array.from({ length: paginas.length }, (_, i) =>
            new StringSelectMenuOptionBuilder().setLabel(`Página ${i + 1}`).setValue(String(i))
          )
        )
    );

    const mensaje = await interaction.reply({
      embeds: [construirEmbed(paginas[0], 0)],
      components: [fila],
      fetchReply: true,
    });

    const colector = mensaje.createMessageComponentCollector({ time: 120000 });

    colector.on('collect', async (i) => {
      if (i.customId !== 'historial_pagina') return;
      if (i.user.id !== interaction.user.id) {
        return i.reply({ content: 'Este historial no es tuyo.', flags: MessageFlags.Ephemeral });
      }
      actual = Number(i.values[0]);
      const filaNueva = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('historial_pagina')
          .setPlaceholder(`Página ${actual + 1} de ${paginas.length}`)
          .addOptions(
            Array.from({ length: paginas.length }, (_, id) =>
              new StringSelectMenuOptionBuilder().setLabel(`Página ${id + 1}`).setValue(String(id))
            )
          )
      );
      await i.update({ embeds: [construirEmbed(paginas[actual], actual)], components: [filaNueva] });
    });
  },
};