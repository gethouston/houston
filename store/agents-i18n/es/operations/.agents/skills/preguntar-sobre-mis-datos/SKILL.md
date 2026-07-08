---
name: preguntar-sobre-mis-datos
title: "Preguntar sobre mis datos"
description: "Haz cualquier pregunta sobre tus datos en lenguaje simple y obtén una respuesta real. Yo la traduzco a SQL de solo lectura contra tu almacén de datos conectado, te aviso antes de ejecutar algo costoso, la ejecuto, guardo la consulta para reutilizarla y te devuelvo el resultado señalando cualquier advertencia, para que no termines usando un número que en realidad está mal."
version: 1
category: Operaciones
featured: no
image: clipboard
---


# Preguntar sobre mis datos

## Cuándo usarla

El usuario hizo una pregunta sobre datos. Cualquier cosa formulada como "cuántos", "cuál es", "top N por", "tendencia de", "compara X con Y", "por qué cambió Z". Traduzco a SQL, ejecuto de forma segura, devuelvo el resultado con citas.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta habilidad verifico que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido conectarla desde la pestaña de Integraciones y me detengo.

- **Almacén de datos / fuente de datos** (Postgres, BigQuery, Snowflake, Redshift) - Requerido. Aquí ejecuto el SQL de solo lectura. Sin almacén de datos no hay respuesta.

Si no hay un almacén de datos conectado, me detengo y te pido conectarlo primero.

## Información que necesito

Primero leo tu contexto de operaciones. Por cada campo requerido que falte hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Dónde viven los datos** - Requerido. Por qué lo necesito: necesito saber a qué almacén de datos consultar y su dialecto de SQL. Si falta, pregunto: "¿Dónde viven estos datos? Lo mejor es conectar tu almacén de datos desde la pestaña de Integraciones y decirme cuál usar."
- **Límites de costo** - Opcional. Por qué lo necesito: te aviso antes de ejecutar algo que escanearía más que tu límite. Si no lo tienes, sigo adelante con TBD y uso un valor conservador de 100 GB escaneados.
- **Esquemas de las tablas** - Opcional. Por qué lo necesito: me permite redactar SQL preciso sin adivinar nombres de columnas. Si no lo tienes, inspecciono el almacén de datos sobre la marcha.
- **Documento de contexto operativo** - Requerido. Por qué lo necesito: ancla lo que significa "este número se ve raro" contra tus prioridades. Si falta, pregunto: "¿Quieres que configure tu contexto operativo primero? Me ayuda a detectar resultados sospechosos."

## Reglas duras

- **Solo lectura.** Cualquier consulta propuesta que contenga `INSERT`, `UPDATE`,
  `DELETE`, `MERGE`, `DROP`, `CREATE`, `ALTER`, `TRUNCATE`, `GRANT`
  o `REVOKE` se rechaza de inmediato.
- **Aviso antes de ejecutar una consulta potencialmente costosa.** Uso
  la herramienta de explain / dry-run del almacén de datos (la descubro vía `composio search
  warehouse explain` o el equivalente del proveedor) para estimar
  bytes escaneados + tiempo de ejecución. Comparo contra
  `config/data-sources.json` → `costCeilingScannedGb` y
  `costCeilingSeconds` para la fuente objetivo. Si se excede,
  informo la estimación y espero tu aprobación explícita.
- **Cada resultado incluye**: el SQL exacto, la hora de ejecución,
  el conteo de filas y cualquier advertencia de calidad de datos.

## Pasos

1. **Leo `context/operations-context.md`.** Si
   falta o está vacío, me detengo y te pido correr primero la habilidad `set-up-my-ops-info`. Las prioridades y las herramientas anclan qué
   fuente usar y qué significa "este número se ve raro".

2. **Identifico la fuente.** Leo `config/data-sources.json`. Si
   está vacío o incompleto, hago UNA pregunta: "¿Dónde vive esto?
   *Lo mejor: conecta tu almacén de datos vía Composio y dime el nombre.
   O describe la tabla y lo marcaré como no verificado hasta que
   esté conectado.*" Escribo la respuesta y continúo.

3. **Introspección diferida del esquema.** Leo `config/schemas.json`. Para
   las tablas que probablemente necesite, si falta la entrada o
   `lastIntrospectedAt` tiene más de 7 días, ejecuto la herramienta de
   introspección de esquemas del almacén de datos (la descubro vía `composio search`) para
   extraer columnas, tipos, nulabilidad y pistas de clave primaria. Agrego a
   `config/schemas.json`. Si la introspección está bloqueada (sin
   almacén de datos conectado), te pido conectar uno y me detengo: nada de
   adivinar nombres de columnas.

4. **Redacto el SQL.** Uso el dialecto de
   `config/data-sources.json`. Prefiero CTEs por legibilidad. Aplico
   filtros de partición / cluster / fecha cuando estén disponibles. Genero
   un slug en kebab-case a partir del propósito de la pregunta (p. ej.
   `weekly-signups-last-7d`).

5. **Autoverificación contra las reglas duras.** Escaneo el texto de la consulta buscando
   palabras clave prohibidas (sin distinguir mayúsculas). Si encuentro alguna, rechazo y
   me detengo.

6. **Estimo el costo.** Ejecuto la herramienta de explain / dry-run del almacén de datos.
   Comparo contra los límites en `config/data-sources.json` para esta
   fuente. Si supera el límite:

   > "Esto escaneará ~{bytes en formato legible} (~{filas}). ¿Lo ejecuto?"

   Espero tu aprobación. Si no lo supera, continúo.

7. **Ejecuto vía Composio.** Corro la consulta a través de la herramienta del
   almacén de datos conectado (slug descubierto vía `composio search
   warehouse`). Si tiene éxito, capturo las filas del resultado (tope de 10,000 para
   almacenamiento local; registro el conteo real de filas por separado).

8. **Capturo advertencias de calidad de datos.** Reviso el resultado buscando
   porcentajes de nulos en columnas clave, números sospechosamente redondos, resultados
   de cero filas donde esperabas datos, rangos que se ven mal
   (conteos negativos, eventos con fecha futura). Listo todo en `notes.md`:
   nunca escondo una preocupación.

9. **Guardo como reutilizable.** Escribo de forma atómica:
   - `queries/{slug}/query.sql` - el cuerpo de la consulta.
   - `queries/{slug}/result-latest.csv` - el resultado.
   - `queries/{slug}/notes.md` - propósito, parámetros, dependencias de esquema,
     advertencias, metadatos de la última ejecución (hora, conteo de filas, bytes
     escaneados).

10. **Actualizo `queries.json`.** Leer-fusionar-escribir. Upsert por slug.
    Establezco `{ purpose, author: "agent", sourceId, schemaDeps, tags,
    costWarning, lastRunAt, lastRowCount }`.

11. **Agrego a `outputs.json`** con `type: "query-answer"`,
    status "ready".

12. **Devuelvo la respuesta en el chat.** Formato:

    ```
    {respuesta en lenguaje simple, 1 a 3 frases}

    Query: `queries/{slug}/query.sql`
    Ran at: {ISO-8601}
    Rows: {N}
    Caveats: {en viñetas o "none"}
    ```

## Salidas

- `queries/{slug}/query.sql` (nuevo o sobrescrito)
- `queries/{slug}/result-latest.csv` (sobrescrito)
- `queries/{slug}/notes.md` (nuevo o sobrescrito)
- `queries.json` actualizado
- Posiblemente `config/schemas.json` actualizado (introspección diferida)
- Agrega a `outputs.json` con `type: "query-answer"`.

## Lo que nunca hago

- **Ejecutar DML/DDL** - rechazo y me detengo.
- **Ejecutar por encima del límite de costo** sin tu aprobación explícita.
- **Esconder una advertencia** - toda preocupación relevante queda en `notes.md`.
- **Inventar nombres de columnas o tablas** - si la introspección está bloqueada,
  me detengo y pido la conexión.
