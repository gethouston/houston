---
name: perfilar-a-mi-comprador
title: "Perfilar a mi comprador"
description: "Construyo un perfil certero de quién realmente compra en un segmento: champion, comprador económico, bloqueador, descalificadores, cuentas ancla. Parto de tu lista de ganados en el CRM o trabajo con los ejemplos que me des. Cada correo en frío, preparación de llamada y propuesta que redacto parte de aquí."
version: 1
category: Ventas
featured: no
image: handshake
integrations: [hubspot, salesforce, attio, pipedrive]
---


# Perfilar a mi comprador

Skill más acotada que un persona de marketing. Objetivo: responder "a quién le vendemos, quién firma, quién bloquea, qué dispara la decisión", las 4 cosas que el agente y el representante necesitan para afinar la prospección y el descubrimiento.

## Cuándo usarla

- "perfila el comité de compra de {segment}".
- "quién firma en {segment}" / "quién realmente nos compra".
- "arma un perfil de comprador para {segment}".
- Llamado por `set-up-my-sales-info` cuando la sección del comité de compra está poco desarrollada.

## Conexiones que necesito

Todo el trabajo externo lo hago a través de Composio. Antes de ejecutar esta skill, verifico que las categorías de abajo estén conectadas. Si falta alguna, digo cuál es, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **CRM**: obtengo las cuentas principales ganadas en el segmento (firmográficos, contactos, tiempo hasta el cierre). Obligatorio, a menos que prefieras que trabaje con ejemplos que tú me des.
- **Redes sociales**: enriquezco los perfiles del champion y del comprador económico vía LinkedIn. Opcional.

Si tu CRM no está conectado, te ofrezco trabajar con 2 o 3 ejemplos de negocios ganados que me describas directamente.

## Información que necesito

Primero leo tu contexto de ventas. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Tu playbook de ventas**: obligatorio. Por qué lo necesito: el perfil refina la sección del comité de compra que está ahí. Si falta, pregunto: "Todavía no tengo tu playbook. ¿Quieres que lo redacte primero?"
- **El segmento a perfilar**: obligatorio. Por qué lo necesito: el perfil es específico del segmento, no genérico. Si falta, pregunto: "¿Qué segmento debo perfilar? Industria, tamaño de empresa, geografía."
- **Fuente de las cuentas**: obligatorio. Por qué lo necesito: puedo tomarlas de tu CRM o trabajar con ejemplos que tú me des. Si falta, pregunto: "¿Traigo los negocios ganados en este segmento desde tu CRM conectado, o prefieres contarme 2 o 3 cuentas reales?"
- **Quién firmó y quién bloqueó en negocios pasados**: opcional. Por qué lo necesito: afina los patrones del comprador económico y del bloqueador. Si no lo tienes, sigo adelante con TBD en la sección de bloqueadores.

1. **Leo el playbook.** Cargo `context/sales-context.md`. Si falta,
   ejecuto primero `set-up-my-sales-info`.

2. **Obtengo las cuentas.** Le pregunto al usuario: "¿Traigo las cuentas
   ganadas en {segment} desde tu CRM conectado, o trabajo con ejemplos que
   me des?" Ruta CRM: `composio search crm` → traigo las ~20 cuentas
   ganadas principales del segmento. Ruta de ejemplos: pido 2 o 3 cuentas
   reales cerradas (o cuentas objetivo que encajen bien).

3. **Extraigo por cuenta.** Para cada cuenta: firmográficos (tamaño,
   región, industria, etapa), cargo y motivaciones del champion, quién
   firmó el contrato, quién puso resistencia o retrasó el proceso, qué
   disparó la búsqueda, tiempo hasta el cierre, caso de uso principal.
   Cito la fuente (registro del CRM o descripción del fundador).

4. **Sintetizo entre cuentas.** Escribo:
   - **Champion**: patrones de cargo, dolores mencionados, motivaciones,
     qué gana cuando el negocio se cierra.
   - **Comprador económico**: patrones de cargo (a menudo distintos del
     champion), qué lo convence (retorno de inversión, mitigación de
     riesgo, ruptura del statu quo, paridad competitiva), por qué mata
     negocios.
   - **Bloqueador**: el rol que más frecuentemente mata negocios en
     {segment} (a menudo TI, legal, compras, o el champion de un
     proveedor incumbente rival). Cómo neutralizarlo.
   - **Influenciadores**: otros roles que hace falta subir al bus.
   - **Descalificadores**: 3 noes rotundos específicos para {segment}
     (si difieren del playbook global).
   - **Disparadores de compra**: señales concretas de que empezaron a
     buscar ahora (patrón de contratación, ronda de inversión, cambio de
     stack, incidente, plazo regulatorio).

5. **Marco los vacíos con honestidad.** `TBD - need 2 more closed-won in segment` en vez de adivinar.

6. **Escribo de forma atómica.** Escribo en `personas/{segment-slug}.md.tmp`, luego renombro. Cito cada afirmación.

7. **Agrego una entrada en `outputs.json`:**

   ```json
   {
     "id": "<uuid v4>",
     "type": "persona",
     "title": "Buying committee  -  {segment}",
     "summary": "<2–3 sentences  -  champion / EB / blocker pattern>",
     "path": "personas/{segment-slug}.md",
     "status": "draft",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>"
   }
   ```

8. **Resumo al usuario.** Un párrafo y la ruta. Señalo qué secciones del playbook actualiza este perfil (comité de compra, descalificadores, disparadores) y si recomiendo ejecutar `set-up-my-sales-info` después para incorporarlo.

## Resultados

- `personas/{segment-slug}.md`
- Agrega una entrada en `outputs.json` con `type: "persona"`.
