---
name: configurar-mi-informacion-legal
title: "Configurar mi información legal"
description: "Cuéntame lo básico sobre tu empresa para poder darte una mejor asesoría legal. Te hago unas cuantas preguntas rápidas sobre tu entidad, tu tabla de capitalización, los contratos vigentes, las plantillas y cualquier riesgo abierto. Solo necesitas hacer esto una vez, y yo lo mantengo actualizado a medida que las cosas cambian."
version: 1
category: Configuración
featured: yes
image: scroll
integrations: [googledocs, notion]
---

# Configurar mi información legal

Este es el documento base que el agente lee antes de cualquier tarea importante. La skill lo crea o actualiza mediante una conversación breve con el usuario.

## Cuándo usarlo

- "configura mi contexto legal" / "redacta el documento de contexto legal" / "arma el documento legal compartido".
- "actualiza el contexto legal" / "cambió nuestra tabla de capitalización, corrige el documento" / "acabamos de firmar el MSA de Acme, agrégalo a los acuerdos vigentes".
- Llamado implícitamente por cualquier otra skill que necesite el contexto compartido cuando falta el documento, solo después de confirmar con el usuario.

## Pasos

1. **Lee la configuración.** Carga `config/entity.json`, `config/posture.json`, `config/templates.json`, `config/profile.json`. Si falta algo, pregunta por UN dato faltante justo a tiempo en lenguaje sencillo (con la mejor pista de modalidad: app conectada > archivo subido > URL > texto pegado).

2. **Lee el documento existente si lo hay.** Si `legal-context.md` ya existe, léelo para que esta corrida sea una actualización, no una reescritura. Conserva las partes que el fundador ya afinó; cambia solo lo que esté desactualizado o sea nuevo.

3. **Trae la tabla de capitalización y los acuerdos vigentes si las fuentes están conectadas.** Si hay una herramienta de tabla de capitalización conectada (`composio search cap-table`: Carta / Pulley / otra), trae la instantánea actual (participación del fundador, pool de opciones, términos de la ronda con precio), y registra la fuente y la fecha de última actualización. No inventes cifras. Si no hay nada conectado, pídele al fundador una instantánea de una línea y marca la fuente como `"self-reported"`.

4. **Haz las preguntas mínimas justo a tiempo.** La entrevista cubre solo lo que la configuración no respondió:
   - Instantánea de la tabla de capitalización (si no hay Carta/Pulley conectado): participación del fundador, pool de opciones, términos de la ronda con precio.
   - Acuerdos vigentes: resúmenes de clientes / proveedores / contratistas / inversionistas (una línea cada uno, no el texto completo).
   - Riesgos abiertos: ¿83(b) sin presentar? ¿CIIAA sin firmar? ¿DPA vencido? ¿propiedad intelectual de contratista sin documentar? Cualquier cosa que el fundador sepa que está sin resolver.
   - Reglas de escalamiento: cualquier cosa que el fundador quiera que siempre se escale (por ejemplo, "siempre marca los tratos de más de $50K de ACV").

5. **Redacta el documento (~400-600 palabras, directo, con verbos en imperativo).** Estructura, en orden:

   1. **Entidad**: nombre, estado, tipo de entidad, fecha de constitución, acciones autorizadas, valor par, agente registrado, vía de constitución. Marca `TBD` en lo que falte.
   2. **Instantánea de la tabla de capitalización**: fecha de última actualización, fuente (Carta / Pulley / hoja de cálculo / self-reported), participación del fundador, pool de opciones, términos de la ronda con precio (si hay).
   3. **Acuerdos vigentes**: lista en viñetas por categoría (clientes, proveedores, contratistas, inversionistas). Una línea por acuerdo: contraparte, tipo, fecha de entrada en vigor, plazo / renovación automática, obligaciones clave. Solo resumen, no el texto completo.
   4. **Catálogo de plantillas**: referencias a las plantillas vigentes de NDA / MSA / consultoría / oferta / DPA. Cada una con versión y fecha de última revisión. Marca `none` si el fundador no tiene plantilla para ese tipo.
   5. **Riesgos abiertos**: en viñetas. Cada uno con severidad (baja / media / alta) + descripción de una línea. Escala la severidad `alta` en el tablero.
   6. **Postura de riesgo del fundador**: postura (agresiva / intermedia / conservadora) + color a nivel de cláusula de `config/posture.json`. Conserva las notas textuales del fundador donde las haya dado.
   7. **Reglas de escalamiento**: qué manejo yo y qué no sin un abogado humano. Piso por defecto: cualquier cosa por encima de $100K de ACV, cualquier indemnización no estándar, cualquier propiedad intelectual que salga, cualquier celda en `mayor × probable` en la lectura de severidad×probabilidad de 5×5.

6. **Marca los vacíos con honestidad.** Si una sección queda delgada (sin tabla de capitalización conectada, sin acuerdos vigentes todavía, riesgos abiertos sin entrevistar), escribe `TBD: {qué debería traer el fundador la próxima vez}` en vez de adivinar. Nunca inventes fechas, acciones ni contrapartes.

7. **Escribe de forma atómica.** Escribe en `legal-context.md.tmp`, renombra a `legal-context.md`. Archivo único en la raíz del agente. NO en una subcarpeta. NO bajo `.agents/`. NO bajo `.houston/<agent>/`.

8. **Agrega a `outputs.json`.** Lee el arreglo existente, agrega una nueva entrada, escribe de forma atómica:

   ```json
   {
     "id": "<uuid v4>",
     "type": "legal-context",
     "title": "Legal context updated",
     "summary": "<2-3 sentences  -  what changed this pass, e.g. added Acme MSA to standing agreements; flipped posture to conservative on liability>",
     "path": "legal-context.md",
     "status": "ready",
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>"
   }
   ```

   (El documento en sí es un archivo vivo, pero cada edición sustancial queda indexada para que el fundador vea la actualización en el panel. Se publica como `ready`: el documento es una instantánea de hechos, no un borrador.)

9. **Resume para el usuario.** Un párrafo corto en lenguaje sencillo: qué sabes ahora, qué falta todavía, y lo único más útil que hacer a continuación (por ejemplo, "Conecta Carta y puedo mantener tu tabla de capitalización actualizada automáticamente."). Nunca nombres rutas de archivo ni campos internos.

## Resultados

- `legal-context.md` (en la raíz del agente, documento vivo)
- Se agrega a `outputs.json` con `type: "legal-context"`, `status: "ready"`.
