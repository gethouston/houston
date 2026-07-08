---
name: preparar-un-paquete-para-inversionistas
title: "Preparar un paquete para inversionistas"
description: "Redacta el paquete que necesitas para tu directorio o tus inversionistas sin partir de una página en blanco. Elige lo que necesitas: un paquete para el directorio con las 8 secciones estándar (resumen ejecutivo, actualización del negocio, métricas, metas, logros, desafíos, solicitudes y anexo); o una actualización mensual o trimestral para inversionistas escrita con tu tono y basada en el avance real de tus metas, decisiones y métricas. Señalo cada dato pendiente en lugar de inventar números."
version: 1
category: Operaciones
featured: no
image: clipboard
integrations: [googledocs, googledrive, notion]
---


# Preparar un paquete para inversionistas

Una habilidad, dos artefactos con voz de fundador: el paquete para el directorio y la actualización para inversionistas. Ambos son un ensamblaje con criterio sobre datos que ya tienes: metas, decisiones, métricas, logros, desafíos.

## Cuándo usarla

- `type=board-pack`  -  "prepara el paquete del directorio del Q{N}" / "arma el paquete del directorio {yyyy-qq}" / reunión de directorio a 2+ semanas según tu cadencia con inversionistas.
- `type=investor-update`  -  "redacta la actualización mensual para inversionistas" / "escribe la carta a inversionistas del Q{N}" / actualización pendiente según la cadencia.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta habilidad verifico que las categorías de abajo estén vinculadas. Si falta alguna, nombro la categoría, te pido conectarla desde la pestaña de Integraciones y me detengo.

- **Documentos / notas** (Google Docs, Notion)  -  Opcional. Si está conectada, replico el borrador para que puedas editarlo y compartirlo sin salir de tu herramienta habitual.
- **Archivos** (Google Drive)  -  Opcional. Me permite dejar una copia en la carpeta compartida correcta.
- **Warehouse / fuente de datos**  -  Opcional. Me permite refrescar los números de las métricas si los snapshots de `set-up-tracking` están desactualizados.

Esta habilidad funciona sin ninguna conexión: los paquetes para el directorio y las actualizaciones para inversionistas se redactan primero de forma local. Nunca me bloqueo aquí.

## Información que necesito

Primero leo tu contexto de operaciones. Por cada campo obligatorio que falte hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Resumen de la empresa**  -  Obligatorio. Por qué lo necesito: el párrafo de apertura se apoya en la etapa, el pitch y lo que es cierto hoy. Si falta, pregunto: "En una o dos frases, ¿qué hace la empresa, para quién es y en qué punto están hoy?"
- **Tu voz**  -  Obligatorio. Por qué la necesito: las actualizaciones para inversionistas tienen que sonar como tú, no como una plantilla. Si falta, pregunto: "Lo mejor es conectar tu bandeja de entrada para que pueda tomar una muestra de 20 a 30 mensajes enviados. Si no, pega 3 a 5 correos o cartas que hayas escrito y que suenen como tú."
- **Cadencia con inversionistas**  -  Obligatorio. Por qué la necesito: mensual o trimestral cambia el alcance, la extensión y lo que cuenta como logro. Si falta, pregunto: "¿Cada cuánto actualizas a tus inversionistas, mensual, trimestral, ambas? ¿Y qué inversionistas la reciben?"
- **Periodo del reporte**  -  Obligatorio. Por qué lo necesito: ancla la extracción de métricas y la ventana de decisiones. Si falta, pregunto: "¿Qué periodo cubre esta actualización, el último mes, el último trimestre, lo que va del año?"
- **Último snapshot de metas, decisiones y métricas**  -  Obligatorio. Por qué lo necesito: ensamblo a partir de tu trabajo guardado, nunca invento. Si falta, pregunto: "¿Quieres que primero refresque tus metas y métricas? El paquete quedará más completo."

## Parámetro: `type`

- `board-pack`  -  borrador de presentación de 8 secciones para la reunión trimestral del directorio. Salida: `board-packs/{yyyy-qq}/board-pack.md` (+ réplica opcional en Google Docs vía Composio si está conectado).
- `investor-update`  -  narrativa con voz de CEO para la actualización mensual o trimestral. Salida: `investor-updates/{yyyy-qq}/update.md`.

## Pasos

1. Leo `config/context-ledger.json`. Lleno los vacíos con UNA pregunta priorizada por modalidad.
2. Leo `context/operations-context.md`  -  prioridades activas, ritmo operativo, líneas rojas, notas de voz. Ancla lo que significa "avance".
3. Reúno los datos de origen:
   - Último snapshot de metas de `goal-history.json` (de `track-my-goals`). Calculo el movimiento frente al periodo anterior.
   - Decisiones en `decisions.json` + notas por decisión en `decisions/{slug}/` dentro del periodo del reporte.
   - Valores de métricas de `metrics-daily.json` (de `set-up-tracking`) y `rollups/` (de `run-my-ops-review period=metrics-rollup`).
   - Revisiones semanales en `reviews/` del periodo.
   - Anomalías abiertas de `anomalies.json`.
   - Cuellos de botella de `bottlenecks.json`.

4. Ramifico según `type`:

   **Si `type = board-pack`:**
   - Redacto el paquete de 8 secciones:
     1. **Resumen ejecutivo**  -  una página, 3-5 puntos: el mayor movimiento, la mayor solicitud, el mayor riesgo.
     2. **Actualización del negocio**  -  narrativa, 300-500 palabras. Qué se lanzó, por qué importa, qué sigue.
     3. **Métricas**  -  tabla de métricas monitoreadas: actual / periodo anterior / dirección / comentario.
     4. **Metas**  -  estado por métrica de meta (en curso / en riesgo / desviada) con la causa raíz de las desviadas.
     5. **Logros**  -  3-5 logros concretos, cada uno anclado a una métrica o una decisión.
     6. **Desafíos**  -  2-4 desafíos concretos, cada uno con hipótesis y lo que estamos intentando.
     7. **Solicitudes**  -  peticiones explícitas al directorio (presentaciones, consejo, decisiones).
     8. **Anexo**  -  enlaces a registros de decisiones, consultas detalladas, revisiones semanales.
   - Señalo cada campo sin completar con `TBD  -  {lo que necesitas aportar}`. Nunca invento números.

   **Si `type = investor-update`:**
   - Redacto una narrativa con voz de CEO (~600-900 palabras):
     - Apertura: un párrafo, etapa + lo que es cierto hoy.
     - Puntos altos: 3-5 puntos de movimiento (métrica / decisión / lanzamiento).
     - Puntos bajos: 1-2 temas honestos con su mitigación.
     - Bloque de estado de las métricas de meta: una línea por métrica de meta con su dirección.
     - Solicitudes: 2-3 puntos concretos: presentaciones, consejo, tiempo para contrastar ideas.
     - Cierre: un párrafo, el foco del próximo periodo.
   - Ajusto la voz contra `config/voice.md` + las prioridades de `context/operations-context.md`.
   - Señalo cada TBD.

5. Escribo de forma atómica (`.tmp` → renombrar) en la ruta.
6. Si `googledocs` o `notion` está conectado y lo aceptaste, replico el borrador al formato preferido con un enlace de vuelta.
7. Agrego a `outputs.json` con `{id, type, title, summary, path, status: "draft", createdAt, updatedAt, domain: "planning"}`. Type = `"board-pack"` o `"investor-update"`.
8. Resumo: ruta + cada TBD señalado + una cosa para revisar primero (p. ej. "sección de Desafíos: la hipótesis de la caída en la página de precios es mía, no tuya; revísala antes de enviar").

## Salidas

- `board-packs/{yyyy-qq}/board-pack.md` (+ réplica opcional en Google Docs).
- `investor-updates/{yyyy-qq}/update.md` (+ réplica opcional en Google Docs).
- Agrega entradas a `outputs.json`.

## Lo que nunca hago

- Enviar, publicar, compartir. Solo borradores: tú revisas, editas y envías.
- Inventar métricas, citas o movimientos sin evidencia. Un TBD no es un fallo, es un estado honesto.
- Prometer resultados. "Llegaremos a {métrica de meta} para {fecha}" → solo si tú lo dijiste.
- Tocar los registros de inversionistas en el CRM.
