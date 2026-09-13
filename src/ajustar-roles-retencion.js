require('dotenv').config();
const { REST, Routes } = require('discord.js');

const GUILD_ID = '1545794465468260453';

const RET_CON_FUEGO = {
  Resp: '1548749365575811254',
  ADM: '1548749366586515518',
  AUX: '1548749368037875846',
  LIDER: '1548749369178857564',
};
const ALPHA = '1545798743503147028';

async function main() {
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  const roles = await rest.get(Routes.guildRoles(GUILD_ID));
  const porId = new Map(roles.map((r) => [r.id, r]));

  for (const [rango, id] of Object.entries(RET_CON_FUEGO)) {
    const rol = porId.get(id);
    if (!rol) {
      console.log(`No encontré ${rango} Retención (${id})`);
      continue;
    }
    const nuevoNombre = rol.name.replace('🔥', '⚡');
    await rest.patch(Routes.guildRole(GUILD_ID, id), { body: { name: nuevoNombre } });
    console.log(`${rol.name} -> ${nuevoNombre} (${id})`);
  }

  const alpha = porId.get(ALPHA);
  if (!alpha) {
    console.log('No encontré el rol WS_Alpha.');
    return;
  }

  const body = {
    name: '⚡┋Equipo Retención',
    permissions: alpha.permissions,
    color: alpha.color,
    hoist: alpha.hoist,
    mentionable: alpha.mentionable,
  };
  if (alpha.icon) body.icon = alpha.icon;
  if (alpha.unicodeEmoji) body.unicodeEmoji = alpha.unicodeEmoji;

  const nuevo = await rest.post(Routes.guildRoles(GUILD_ID), { body });
  console.log(`Creado: ${nuevo.name} (${nuevo.id})`);

  const pos = alpha.position - 1;
  await rest.patch(Routes.guildRole(GUILD_ID, nuevo.id), { body: { position: pos } });
  console.log(`Posicionado justo debajo de ${alpha.name} (pos ${pos}).`);
}

main().catch((error) => {
  console.error('Error:', error?.message || error);
  process.exit(1);
});