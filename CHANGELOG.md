# CHANGELOG — WallStreet Bot

## v11 — Sin ventana al aceptar
- Quitada la ventana del 2º examinador: al pulsar Aceptar se acepta directamente (como antes).
- Se mantiene el mensaje de reclutado con un solo examinador (quien pulsó Aceptar).

## v10 — Registro de reclutados
- Al aceptar una solicitud, el bot envía al canal de reclutados un mensaje con: Nombre, Equipo, Rango y Examinador.

## v9 — Plantillas de equipos
- Publica una plantilla por equipo (WSB, WSD, WSO, WSA, ORGs) en el canal de plantillas con la cantidad de miembros por rango y los usuarios mencionados.
- Se actualiza sola al verificar a alguien, cuando cambia de roles o cuando alguien sale del server.
- Si alguien tiene varios rangos se cuenta solo en el más alto (Master > Resp > ADM > Auxiliar > Lider > Sub > Miembro > Miembro Test).

## v8 — Apodo automático al verificarse
- Al aceptar la solicitud, el bot pone el apodo con el nombre del usuario y la etiqueta según rango y equipo: `Lid.WSB | Nombre`.
- Rangos: AUX → `Aux.`, LIDER → `Lid.`, SUBLIDER → `Sub.`, MIEMBRO → solo el equipo (`WSB`, `ORGs`…), PRUEBA → equipo con `-T` (`WSB-T`).
- Master, Resp. y ADM se quedan solo con el nombre.

## v7 — Sin alertas
- Eliminado el sistema de alertas (mensajes de inicio, errores y estado del bot en el canal de alertas).

## v6 — Verificación con ORGs
- Al verificarse ahora se elige el equipo antes que el rango: WSB, WSD, WSO, WSA u ORGs.
- Si el equipo es WallStreet se elige entre sus rangos; si es ORGs, entre los rangos de ORGs.

## v5 — Comandos y cambios por privado
- Mensaje con la lista de comandos publicado automáticamente en el canal de comandos del staff.
- Comandos de nuevo ocultos para usuarios normales (solo los ve el personal autorizado).
- El bot notifica por privado cada versión nueva de este changelog.

## v1 — Verificación
- Sistema para que los miembros se identifiquen en el servidor con botón de "Verificar".
- Asignación de rangos según corresponda.
- Comandos limitados al personal autorizado.

## v2 — Servidor nuevo
- Adaptación al nuevo servidor (canales y roles propios).
- Publicación automática del mensaje de verificación al arrancar.
- Verificación en pasos: nombre → rango → equipo (WSB, WSD, WSO, WSA), con revisión y aprobación por parte del personal.
- Rol "sin verificar" al entrar y mensaje de bienvenida.
- Comando para consultar los roles del servidor.

## v3 — Logs y control
- Registro automático de actividad: entradas/salidas, cambios de roles, bans, modificaciones del servidor, etc.
- Historial de actividad por usuario.
- Comandos restringidos a Administradores.

## v4 — Alertas y anuncios
- El bot avisa solo si falla algo o se reinicia.
- Comando **anuncio**: el personal envía un mensaje a todo un equipo, publicado en el canal y enviado por privado a cada miembro.