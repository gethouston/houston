---
name: configurar-mi-informacion-de-personal
title: Configurar mi información de personal
description: "Cuéntame cómo manejas Recursos Humanos: valores, niveles (para colaboradores individuales y managers, de L1 a L5), bandas salariales, ritmo del ciclo de evaluaciones, políticas oficiales, reglas de escalamiento, tu voz y tus límites innegociables, para que pueda darte borradores y respuestas precisos. Este es el documento base que toda otra Acción de personal lee primero."
version: 1
category: Personal
featured: yes
image: busts-in-silhouette
integrations: [googlesheets, googledocs, notion]
---


# Configurar mi información de personal

Un documento que toda habilidad del agente lee antes de producir un resultado
sustancial: oferta, plan de mejora de desempeño (PIP), respuesta de política,
puntaje de retención, ciclo de evaluación. Vive en
`context/people-context.md`. Yo redacto, tú decides. Nunca fijo bandas
salariales ni cierro los niveles sin tu confirmación.

## Cuándo usarla

- "redacta nuestro documento de contexto de personal" / "configura nuestro
  contexto de personal" / "documenta cómo manejamos RR.HH.".
- "actualiza el documento de contexto de personal" / "nuestros niveles
  cambiaron, corrige el documento de contexto".
- "redacta nuestro marco de niveles" / "arma la escalera de niveles" /
  "qué es un L3 versus un L4".
- Se llama implícitamente desde cualquier habilidad que necesite el
  documento y no lo encuentre, pero solo después de confirmarlo contigo.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta habilidad reviso que las categorías de abajo estén conectadas. Si falta alguna, la nombro, te pido que la conectes desde la pestaña de Integraciones y me detengo.

- **Plataforma de RR.HH. (Gusto, Deel, Rippling, Justworks)**: para traer la forma del equipo directamente. Opcional.
- **Documentos (Notion, Google Docs)**: para importar un manual o documento de políticas existente. Opcional.
- **Hojas de cálculo (Google Sheets)**: para importar bandas salariales o pegar el roster. Opcional.

Ninguna integración es estrictamente obligatoria, redacto a partir de tus respuestas si no hay nada conectado.

## Información que necesito

Primero leo tu contexto de personal. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Empresa y etapa**: Obligatorio. Por qué lo necesito: antes de la primera contratación necesito más estructura, con 15 o más personas la ajusto. Si falta, pregunto: "¿Cuál es el nombre de la empresa, qué hace en una línea, y cuántas personas hay hoy en el equipo?"
- **Valores**: Obligatorio. Por qué lo necesito: cada definición de nivel se conecta con los valores. Si falta, pregunto: "¿Cuáles son las cuatro a seis cosas que quieres que represente este equipo, en tus propias palabras?"
- **Intención de niveles**: Obligatorio. Por qué lo necesito: no elijo una escalera de niveles por ti. Si falta, pregunto: "¿Quieres una sola escalera para colaboradores individuales, escaleras separadas para colaboradores individuales y managers, o todavía no estás listo para definir niveles?"
- **Postura de compensación**: Opcional. Por qué lo necesito: las bandas moldean los borradores de cartas de compensación y ofertas. Si no la tienes, sigo con TBD en las bandas salariales.
- **Ruteo de escalamiento**: Obligatorio. Por qué lo necesito: las cuestiones de discriminación, acoso, salario y visa necesitan un humano designado. Si falta, pregunto: "¿A quién se derivan esos temas? ¿Hay un abogado laboral designado, o lo marcamos como TBD hasta que contrates uno?"
- **Manual existente**: Opcional. Por qué lo necesito: importo políticas en lugar de inventarlas. Si no lo tienes, sigo con TBD en el canon de políticas.
- **Límites innegociables**: Opcional. Por qué lo necesito: moldea las reglas de contraofertas y otros borradores posteriores. Si no los tienes, sigo con TBD.

## Pasos

1. **Leer `config/context-ledger.json`.** Relleno los vacíos con una
   pregunta puntual.
2. **Leer el documento existente si hay uno.** Si `context/people-context.md`
   ya existe, lo leo para que la corrida sea una actualización, no una
   reescritura. Preservo las partes ya afinadas; cambio solo lo
   desactualizado o lo nuevo.
3. **Importación opcional.** Pregunto una vez: "¿Tienes un manual, documento
   de políticas o planilla de compensación existente del que debería
   partir? Puedo leer Notion, Google Docs o Google Sheets si conectaste
   alguno." Si dice que sí, corro `composio search docs` /
   `composio search sheets`, lo traigo, y cito la fuente por sección.
4. **Insistir en las reglas de escalamiento, no se pueden inferir.**
   Pregunto directamente: "¿A quién se derivan los temas de discriminación,
   acoso, disputas salariales o visa? ¿Un abogado humano designado, o lo
   marcamos como TBD?" Sin valores por defecto. Si aún no hay abogado, la
   sección dice `TBD: se necesita un abogado laboral en retención antes de
   la primera contratación`, y te lo digo explícitamente.
5. **Redactar el documento (~500-900 palabras, con posición clara).**
   Secciones, en orden:
   1. **Valores de la empresa**: 4 a 6 valores, con definiciones de una
      línea. En tus propias palabras, sin clichés de póster de RR.HH.
   2. **Forma del equipo**: cantidad de personas por función, posiciones
      abiertas. Lo traigo de la plataforma de RR.HH. conectada si está
      disponible, si no, lo pego.
   3. **Marco de niveles**: escaleras de colaborador individual y de
      manager con nombres de nivel, expectativas resumidas, alcance de
      impacto, señales de seniority por nivel. Por defecto L1 a L5;
      pregunto una vez si quieres más. Cada nivel tiene: nombre (por
      ejemplo, "Ingeniero Senior"), un párrafo de expectativas, alcance
      (equipo / función / organización / cruzando organizaciones), señales
      de seniority (banda aproximada de años, poder de decisión,
      tolerancia a la ambigüedad), y una línea "Encarna {valor X, valor Y}
      en este nivel al…" que conecta con la sección de valores.
   4. **Bandas salariales**: rango por nivel, postura sobre equity,
      multiplicadores por ubicación. Acepto `TBD` generosamente, los
      founders en semana 0 no conocen todavía sus bandas.
   5. **Ritmo del ciclo de evaluaciones**: anual / semestral / trimestral,
      próxima fecha de ciclo.
   6. **Canon de políticas**: licencias, beneficios, gastos, trabajo
      remoto, viajes, equipo. Enlazo documentos fuente donde existan;
      `TBD` donde no.
   7. **Reglas de escalamiento**: qué responde el agente, qué se deriva al
      founder, qué se deriva al abogado. Nombro al abogado o al estudio, o
      escribo `TBD: se necesita un abogado laboral en retención`. Sección
      clave para `answer-a-policy-question` y `draft-a-people-document`.
   8. **Notas de voz**: 4 a 6 puntos sobre tono, formas de saludo, frases
      prohibidas, preferencia de largo de oración. Del resumen de voz del
      registro más `config/voice.md` si existe.
   9. **Límites innegociables**: lo que el equipo nunca hace (por ejemplo,
      "nunca hacemos contraofertas ante renuncias", "nunca publicamos
      salarios", "siempre damos 30 días de aviso antes de vencimientos de
      equity").
6. **Marcar los vacíos con honestidad.** Sección delgada, escribo
   `TBD: {qué deberías traer la próxima vez}`. Nunca invento. Especialmente
   nunca invento bandas salariales, ruteo de escalamiento ni lenguaje legal.
7. **Escribir de forma atómica** en `context/people-context.md.tmp`, luego
   renombrar. Un solo archivo en `context/`. NO bajo `.agents/`. NO bajo
   `.houston/<agent>/`.
8. **Actualizar el registro.** Fijo
   `universal.positioning = { present: true, path:
   "context/people-context.md", lastUpdatedAt: <ISO> }` de forma atómica.
9. **Agregar a `outputs.json`.** Entrada:
   ```json
   {
     "id": "<uuid v4>",
     "type": "people-context",
     "title": "People-context doc updated",
     "summary": "<2-3 oraciones: qué cambió en esta corrida + qué secciones siguen en TBD>",
     "path": "context/people-context.md",
     "status": "draft",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>",
     "domain": "culture"
   }
   ```
   (El documento es un archivo vivo; cada edición sustancial queda
   indexada para que el rastro de actualizaciones se vea en el panel.)
10. **Resumir.** Un párrafo: qué cambió, qué secciones siguen en `TBD`
    (especialmente reglas de escalamiento y bandas salariales), y el
    próximo paso concreto.

## Resultados

- `context/people-context.md` (documento vivo).
- Se agrega a `outputs.json` con `type: "people-context"`,
  `domain: "culture"`.

## Lo que nunca hago

- Fijar bandas salariales o cerrar definiciones de niveles sin tu
  confirmación.
- Redactar reglas de escalamiento sin input explícito, pregunto o marco
  `TBD`. Sección clave y de naturaleza legal.
- Escribir el documento bajo `.agents/` o `.houston/<agent>/`, el
  observador de Houston ignora esas rutas. Siempre en `context/`.
