---
name: perfilar-a-mi-cliente
title: "Perfilar a mi cliente"
description: "Construyo un perfil detallado del cliente que quieres conquistar. Tomo datos de tu CRM o de lo que me pegues, y te doy un perfil con trabajos por resolver (jobs-to-be-done), dolores ordenados por prioridad, disparadores de compra, patrones de objeciones y cuentas ancla reales. Cada anuncio, landing page y correo que escribo parte de aquí."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [hubspot, salesforce, attio]
---


# Perfilar A Mi Cliente

Plantilla de origen: Gumloop "Market Segmentation: Buyer Persona Pain Point Report". Adaptada para un founder solo que lleva todo por su cuenta.

## Cuándo usarlo

- "perfila a nuestro cliente ideal" / "construye un perfil para {segmento}" / "ayúdame a definir el buyer persona de {rol}".
- "vamos hacia upmarket, rehaz el perfil" / "el perfil de SMB cambió, actualízalo".
- "construye un perfil a partir de cuentas ganadas" / "toma los datos de mi CRM, no corazonadas" / "quién realmente está comprando esto, mira las cuentas ganadas".
- Se invoca implícitamente cuando otra skill (por ejemplo, `plan-a-campaign`, `set-up-my-marketing-info`) necesita más profundidad de perfil de la que da `config/ideal-customer.json`.

## Conexiones que necesito

Hago el trabajo externo a través de Composio. Antes de correr esta skill reviso que las categorías de abajo estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **CRM (HubSpot, Salesforce, Attio)**, traigo las cuentas principales ganadas y perdidas para que el perfil esté fundamentado en quién realmente compra. Necesario si quieres que infiera el perfil, opcional si prefieres pegar la información.
- **Notas de reuniones (Gong, Fireflies, Circleback)**, dolores, objeciones y disparadores textuales. Opcional pero mejora mucho la calidad del perfil.
- **Búsqueda y extracción web (Exa, Perplexity, Firecrawl)**, completa definiciones de rol, reportes de mercado y flujos de trabajo comunes. Opcional.

Si quieres un perfil fundamentado en el CRM y no hay ningún CRM conectado, me detengo y te pido que conectes HubSpot, Salesforce o Attio (o que me pegues las cuentas principales).

## Información que necesito

Primero leo tu contexto de marketing. Por cada campo requerido que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tu posicionamiento**, Necesario. Por qué lo necesito: el trabajo de perfil se desperdicia sin un ancla de posicionamiento. Si falta, pregunto: "¿Quieres que primero redacte tu posicionamiento? Es una skill, toma unos cinco minutos."
- **El segmento a perfilar**, Necesario. Por qué lo necesito: un perfil por corrida, no quiero construir el equivocado. Si falta, pregunto: "¿Qué segmento estamos perfilando, tu cliente ideal principal o uno nuevo? Una descripción corta funciona, o indícame tu CRM."
- **Cuentas principales de las que aprender**, Necesario. Por qué lo necesito: no voy a inventar datos demográficos. Si falta, pregunto: "Conecta tu CRM para que pueda traer tu lista de cuentas ganadas, o pégame cinco cuentas (ganadas u objetivo) de las que quieras que aprenda."

## Pasos

1. **Leer el documento de posicionamiento** (archivo propio, ya que esto es HoM): `context/marketing-context.md`. Si falta, correr `set-up-my-marketing-info` primero, el trabajo de perfil se desperdicia sin un ancla de posicionamiento.

2. **Leer configuración.** `config/ideal-customer.json`, `config/company.json`. Si la configuración del cliente ideal está incompleta y el usuario no ha nombrado el segmento, hacer UNA pregunta puntual: "¿Qué segmento estamos perfilando, tu cliente ideal principal o uno nuevo?" (Mejor modalidad: pegar una línea, o señalar el CRM conectado vía Composio para que infiera a partir de las cuentas principales.)

3. **Reunir evidencia.** Orden de prioridad:
   - `call-insights/` existente bajo la raíz de este agente, el lenguaje textual del cliente es oro.
   - CRM conectado vía `composio search crm`, cuentas principales ganadas y perdidas que coincidan con el segmento.
   - App de notas de reuniones conectada vía `composio search meeting-notes`.
   - Investigación web vía `composio search web-search` o `composio search research`, reportes de mercado, definiciones de rol, flujos de trabajo comunes.
   - Notas pegadas por el founder.

4. **Redactar el perfil (markdown, ~400-600 palabras).** Estructura:

   1. **Nombre del segmento + resumen de una línea** (por ejemplo, "líderes de RevOps de Serie B en SaaS B2B de 50-200 personas").
   2. **Datos demográficos / firmográficos**, industria, tamaño, etapa, geografía, rol, seniority, a quién reporta.
   3. **Trabajos por resolver (jobs-to-be-done)**, 2-4 trabajos para los que contratan un producto como el nuestro. Lenguaje textual cuando sea posible.
   4. **Dolores**, ordenados por intensidad + frecuencia. Citar la fuente (cita de llamada, razón de pérdida en el CRM, reporte de investigación).
   5. **Disparadores**, patrones de señales que hacen que este perfil sea comprador activo ahora (contratando el rol, cambiando de herramienta, evento de financiamiento, fecha límite de cumplimiento).
   6. **Cuentas ancla**, 3-5 empresas reales que encajan, idealmente 1-2 ya clientes. Nómbralas.
   7. **Patrones de objeciones**, las 3 objeciones principales que plantea este perfil, mejor respuesta de una línea para cada una.
   8. **Proceso de compra**, quién inicia, quién bloquea, quién firma, duración típica del ciclo, tamaño típico del comité.
   9. **Dónde pasan el tiempo**, comunidades, newsletters, podcasts, conferencias, accionable para el calendario de redes y jugadas de comunidad.
   10. **Ganchos de copy**, 3-5 líneas cortas que reproducen el patrón del lenguaje de este perfil. Reutilizadas por contenido, correo de ciclo de vida y borradores de redes.

5. **Marcar DESCONOCIDO, no adivinar.** Cada sección con evidencia insuficiente recibe una nota `DESCONOCIDO, {qué lo resolvería}`. Sin datos demográficos inventados.

6. **Actualizar `config/ideal-customer.json` si el perfil afina el cliente ideal por defecto.** Escritura atómica. Preguntar al usuario antes de sobrescribir, a menos que haya dicho "actualiza el cliente ideal".

7. **Escribir de forma atómica** en `personas/{segment-slug}.md`, escribir `{path}.tmp`, luego renombrar.

8. **Agregar a `outputs.json`.** Leer el arreglo existente, agregar la nueva entrada, escribir de forma atómica:

   ```json
   {
     "id": "<uuid v4>",
     "type": "persona",
     "title": "<Nombre del segmento>",
     "summary": "<2-3 oraciones, quiénes son, dolor principal, disparador principal>",
     "path": "personas/<slug>.md",
     "status": "draft",
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>"
   }
   ```

9. **Resumir para el usuario.** Un párrafo: segmento en una línea, dolor principal + disparador principal, mayor vacío en el perfil (qué investigar después), ruta al resultado.

## Resultados

- `personas/{segment-slug}.md`
- Agrega a `outputs.json` con `type: "persona"`.
- Puede actualizar `config/ideal-customer.json` (con aprobación del usuario).
