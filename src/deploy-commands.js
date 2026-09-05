require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');

const comandos = [];

function cargarComandos(dir) {
  const archivos = fs.readdirSync(dir);
  for (const archivo of archivos) {
    const ruta = path.join(dir, archivo);
    if (fs.statSync(ruta).isDirectory()) {
      cargarComandos(ruta);
    } else if (archivo.endsWith('.js')) {
      const comando = require(ruta);
      if ('data' in comando && 'execute' in comando) {
        comandos.push(comando.data.toJSON());
      }
    }
  }
}

cargarComandos(path.join(__dirname, 'commands'));

(async () => {
  try {
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    console.log(`Registrando ${comandos.length} comandos...`);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: comandos },
    );
    console.log('Comandos registrados correctamente.');
  } catch (error) {
    console.error(error);
  }
})();