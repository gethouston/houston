---
name: crear-campana-en-instantly
title: "Crear campaña en Instantly"
description: "Creo una campaña de correo en frío en pausa dentro de Instantly, con todos los leads cargados y todas las cuentas de envío conectadas. Leo la secuencia que cerraste conmigo, limpio los cuerpos de los correos (Instantly descarta los cuerpos que contienen el carácter & literal, es un error documentado), cargo hasta 1000 leads por llamada, y configuro el horario con una zona horaria que Instantly acepta (America/Vancouver para el Pacífico, que maneja el horario de verano automáticamente). Siempre queda en pausa para que la revises, nunca la lanzo de forma automática."
version: 1
category: Prospección
featured: no
image: rocket
integrations: [instantly]
---


# Campaña en Instantly

Creo una campaña de correo en frío completamente cargada y **en pausa** dentro de Instantly. Tomo un archivo de secuencia cerrado más un archivo de contactos verificados, construyo la campaña a través de la API REST de Instantly, evito dos errores conocidos (restricciones del enum de zona horaria y el bug que borra el cuerpo cuando tiene un "&"), cargo todos los leads en una sola llamada, y conecto todas las cuentas de envío que tengas conectadas. La campaña siempre termina en estado `paused`. Tú das clic en Activar cuando estés listo.

## Cuándo usarme

- "Carga esta secuencia en Instantly: <archivo de secuencia>".
- "Crea la campaña de Instantly para esta lista".
- Fase 5 de cualquiera de los dos pipelines de LinkedIn.
- Tienes una secuencia cerrada y una lista de contactos verificados y quieres ponerlos a enviar.

## Cuándo NO usarme

- La secuencia todavía no está cerrada, termina primero `cold-email-sequence`.
- La lista de contactos todavía no tiene emails verificados, ejecuta primero `apollo-enrichment`.
- Quieres **editar** una campaña existente, el panel de Instantly se encarga de eso. Yo creo campañas nuevas; no modifico las que ya están activas.
- Quieres un envío de correo **tibio** (uno a uno a una persona específica), usa Gmail/Outlook directamente, no una plataforma de correo en frío.

## Conexiones que necesito

- **Instantly** (plataforma de envío), obligatoria. Creo la campaña, cargo los leads, conecto las cuentas, configuro el horario.

Si Instantly no está conectado, me detengo y te pido que la conectes.

## Información que necesito

- **El archivo de secuencia cerrado**, obligatorio. Ruta a un archivo `.md` producido por `cold-email-sequence`. Si falta, pregunto: "¿Dónde está el archivo de la secuencia cerrada? Debería estar en tu carpeta `sequences/`."
- **El archivo de contactos verificados**, obligatorio. Ruta al `contacts.json` producido por `apollo-enrichment`. Si falta, pregunto: "¿Dónde está el archivo de contactos? Debería estar en `runs/{runId}/contacts.json`."
- **Un nombre de campaña**, opcional. Por defecto se deriva del nombre del archivo de secuencia (por ejemplo, `2026-05-05-jane-doe-revops-sequence.md` se convierte en `LinkedIn - Jane Doe RevOps`). Puedes indicar otro por llamada.
- **Cuentas de envío para conectar**, opcional. Por defecto son "todas las cuentas de envío conectadas en tu espacio de Instantly". Puedes indicar otras por llamada si quieres solo algunas específicas.
- **Horario**, opcional. Por defecto viene de `config/context-ledger.json` (por defecto `America/Vancouver`, lunes a viernes, 8 a 5).

## Pasos

1. **Leer las entradas.** Parseo el archivo de secuencia en `{subject, body}` por correo. Leo el archivo de contactos en una lista de `{firstName, fullName, email, company, title, linkedinUrl, personalizationFields}`. Verifico que ningún email ni cuerpo esté vacío.

2. **Limpiar los cuerpos.** **Quito cada carácter `&` de cada cuerpo de correo.** El almacenamiento de cuerpos de Instantly descarta en silencio los cuerpos que contienen un "&" literal, la campaña se crea bien, pero el cuerpo se sube vacío y tu campaña termina enviando correos en blanco. Reemplazo `&` por "y". Lo documento en la descripción de la campaña de Instantly para que lo recuerdes más adelante.

3. **Listar cuentas de envío.** Llamo a `list_accounts` de Instantly vía Composio. Si me indicaste cuentas específicas, filtro a esas. Si es "todas" (el valor por defecto), las mantengo todas.

4. **Elegir un horario.** Uso el horario de los valores por defecto de `config/context-ledger.json`. El campo de zona horaria es el más fácil de equivocar, el enum de zona horaria de Instantly es restringido y no acepta todas las zonas `IANA`. Opciones seguras:
   - **Pacífico**: `America/Vancouver` (maneja el horario de verano de la costa oeste de Estados Unidos automáticamente y está en la lista aceptada por Instantly).
   - **Este**: `America/Toronto`.
   - **Europa Central**: `Europe/Berlin`.
   - Si el contexto tiene una zona horaria que Instantly rechaza, uso `America/Vancouver` como respaldo y dejo constancia del cambio en las notas del run.

5. **Crear la campaña.** Envío (POST) al endpoint `create_campaign` de Instantly con:
   - Nombre = derivado (o el que tú diste).
   - Pasos = 3, con desfases de día 0/3/7 según el archivo de secuencia.
   - Cuerpos = los limpiados en el paso 2.
   - Horario = el elegido en el paso 4.
   - Estado = `paused` (siempre, nunca `active`, aunque la API lo permita).

6. **Verificar que todos los cuerpos de los pasos estén completos tras la creación.** Vuelvo a consultar la campaña nueva vía `get_campaign` y confirmo que el cuerpo de cada paso no esté vacío. Si algún paso está vacío, lo reporto con fuerza, o el bug del "&" te alcanzó a pesar de la limpieza, o algún otro campo se perdió. No avanzo al paso de carga.

7. **Cargar los leads por lotes.** Envío (POST) a `add_leads_to_campaign` de Instantly con los contactos verificados. Instantly acepta hasta 1000 leads por llamada, si tienes más, pagino en lotes de 1000. Campos por lead:
   - `email` (obligatorio).
   - `first_name` (obligatorio para el campo de fusión `{{firstName}}`).
   - `last_name`.
   - `company`.
   - `title`.
   - `personalization` (opcional, solo se puebla para contactos de origen reacción donde `personalizationFields` no está vacío).
   - `linkedin_url` (útil pero no obligatorio).

8. **Conectar las cuentas de envío.** Envío (POST) a `attach_accounts_to_campaign` de Instantly con las cuentas del paso 3. Conectar todas las cuentas es el comportamiento por defecto; Instantly rota los envíos entre ellas, lo que mejora la entregabilidad frente a una sola cuenta.

9. **Confirmar el estado de pausa.** Vuelvo a consultar la campaña una vez más. Confirmo `status: "paused"`. Si es cualquier otra cosa que no sea pausada, lo registro con fuerza en las notas del run y te lo aviso, Instantly nunca debería activarse solo, pero si se coló una configuración por defecto, necesitas saberlo de inmediato.

10. **Agregar a `campaigns.json`.** Una fila: `{name, instantlyCampaignId, sequenceFile, leadCount, sendingAccounts, schedule, status: "paused", createdAt}`.

11. **Actualizar `leads.json`.** Para cada lead cargado, fijo `loadedToCampaignId: instantlyCampaignId` en la fila correspondiente por `email`. Lectura, fusión y escritura de forma atómica.

12. **Agregar a `outputs.json`.** Una fila: `{type: "campaign", title: "{Campaign name}", summary: "Campaign created in Instantly with {leadCount} leads, {accountCount} sending accounts. Status: PAUSED.", path: null, status: "paused", domain: "sending"}`. El `path: null` porque la campaña vive en Instantly, no en disco.

13. **Resumen final para ti.**
    - Nombre de la campaña + estado (pausada).
    - Leads cargados.
    - Cuentas de envío conectadas.
    - Horario (por ejemplo, "lunes a viernes, 8 a 5 Pacífico vía America/Vancouver, maneja el horario de verano automáticamente").
    - Enlace directo a la campaña en el panel de Instantly.
    - "Revísala en Instantly. Actívala cuando estés listo, yo no lo hago por ti."

## Resultados

- Campaña nueva en Instantly (en pausa) con 3 pasos de correo, todos los leads cargados, todas las cuentas de envío conectadas.
- `campaigns.json`, una fila.
- `leads.json`, `loadedToCampaignId` fijado en cada lead cargado.
- `outputs.json`, una fila, `type: "campaign"`, `status: "paused"`, `domain: "sending"`.

## Fallos comunes

| Fallo | Por qué | Solución |
|---|---|---|
| Cuerpo vacío del lado de Instantly tras la carga | Había un `&` literal en el cuerpo del correo | El paso de limpieza los quita; si se coló uno (por ejemplo dentro de una URL), quítalo de nuevo y verifica con `get_campaign` |
| Zona horaria rechazada por `create_campaign` | El enum de zona horaria de Instantly es restringido | Usa `America/Vancouver` (Pacífico), `America/Toronto` (Este), `Europe/Berlin` (Europa Central); evita `Etc/GMT*` |
| 401 en `add_leads_to_campaign` | El token de Instantly venció en Composio | Reconecta Instantly desde la pestaña de Integraciones |
| Cantidad de leads cargados menor a la esperada | Instantly rechazó duplicados en silencio (el mismo email ya estaba en otra campaña) | Esto es correcto; muestra la diferencia en las notas del run para que veas cuáles leads se saltaron y por qué |
| Campaña creada con `status: "active"` | Se me olvidó fijar `status: "paused"` al crear | Siempre lo fijo explícitamente; nunca confío en el valor por defecto de la API |

## Lo que nunca hago

- **Activar la campaña.** Siempre queda en pausa. Tú das clic en Activar en el panel de Instantly. Aunque el orquestador pase una bandera pidiendo que quede activa, me niego, esta es una regla fija, no un valor por defecto.
- **Saltarme el paso de limpieza.** Los cuerpos siempre pasan por la eliminación del "&" antes de subirse, aunque el cuerpo parezca limpio.
- **Saltarme el paso de verificación.** Siempre vuelvo a consultar la campaña después de crearla y después de cargarla para confirmar que los cuerpos no estén vacíos y que el estado sea pausado.
- **Modificar una campaña existente en vivo.** Yo creo campañas nuevas. Editar las que ya están activas es tu trabajo en el panel de Instantly.
- **Fijar de forma rígida los nombres de los endpoints de creación, carga o verificación de campaña.** Todo se descubre vía Composio en tiempo de ejecución.
