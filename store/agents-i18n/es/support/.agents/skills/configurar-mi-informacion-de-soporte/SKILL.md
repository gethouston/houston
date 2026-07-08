---
name: configurar-mi-informacion-de-soporte
title: "Configurar mi información de soporte"
description: "Cuéntame lo básico sobre tu producto, tus clientes, y cómo manejas el soporte, para poder ayudarte mejor. Te hago algunas preguntas rápidas sobre tu producto, tus tiempos de respuesta objetivo, tu lista VIP, las reglas de asignación, y los problemas conocidos. Solo necesitas hacer esto una vez, y yo lo mantengo actualizado a medida que las cosas cambian."
version: 1
category: Soporte
featured: yes
image: headphone
integrations: [googledocs, stripe, notion, github, linear]
---


# Configurar mi información de soporte

Soy dueño de `context/support-context.md`. La única skill que crea o actualiza el documento completo (la sección de enrutamiento también se puede editar con `tune-my-routing`). Todas las demás skills lo leen antes de trabajar. Hasta que exista, me detengo y te pido que me ejecutes primero a mí.

## Cuándo usarla

- "configura nuestro contexto de soporte" / "define nuestro contexto de soporte" / "hagamos el documento de contexto".
- "actualiza el documento de contexto" / "un nuevo nivel / VIP / detalle importante, corrige el contexto".
- Invocada implícitamente por cualquier otra skill que necesite contexto y no encuentre el documento, pero solo después de confirmarlo contigo.

## Conexiones que necesito

Hago el trabajo externo a través de Composio. Antes de ejecutar esta skill, verifico que las categorías de abajo estén conectadas. Si falta alguna → nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Documentos / notas** (Google Docs / Notion)  -  trae documentos existentes de posicionamiento o de producto para arrancar el borrador. Opcional.
- **Facturación** (Stripe)  -  lee los niveles de plan en vivo si prefieres que los infiera en vez de preguntarte. Opcional.
- **Rastreador de desarrollo** (GitHub / Linear)  -  destino nombrado para la regla de enrutamiento de errores. Opcional.

Si ninguna de estas está conectada, sigo adelante. Esta skill es sobre todo una entrevista, las conexiones solo la aceleran.

## Información que necesito

Primero leo tu contexto de soporte. Por cada campo obligatorio que falte, te hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > pegar texto) y espero.

- **Datos básicos de la empresa**  -  Obligatorio. Por qué lo necesito: ancla el resumen del producto al inicio del documento. Si falta, pregunto: "¿Qué hace el producto en una frase, y quién lo compra?"
- **Segmentos de clientes + lista VIP**  -  Obligatorio. Por qué lo necesito: los VIP obtienen prioridad P1 sin importar el contenido; los segmentos moldean cada respuesta. Si falta, pregunto: "¿Quiénes son tus 5 clientes principales ahora mismo, y hay segmentos (SMB / mid-market / enterprise) que deba tratar distinto?"
- **Objetivos de tiempo de respuesta**  -  Obligatorio. Por qué lo necesito: define las expectativas de tiempo de respuesta por nivel. Si falta, pregunto: "¿Qué tiempo de respuesta quieres lograr para tus tickets más urgentes, y qué es aceptable para el resto?"
- **Categorías de enrutamiento**  -  Obligatorio. Por qué lo necesito: la clasificación y la detección de señales mapean cada mensaje entrante a una de ellas. Si falta, pregunto: "Cuando llega un ticket, ¿en qué categorías lo clasificas? ¿Error, guía de uso, facturación, algo más?"
- **Niveles de escalamiento**  -  Obligatorio. Por qué lo necesito: define P1 / P2 / P3 / P4 para la clasificación. Si falta, pregunto: "¿Qué hace que algo sea una emergencia, versus algo del mismo día, versus algo de esta semana?"
- **Muestras textuales de tu voz**  -  Opcional. Por qué lo necesito: la sección de tono se siente más auténtica con frases reales. Si no las tienes, sigo con TBD y te recomiendo correr la calibración de voz.

1. **Leo `config/context-ledger.json`.** Necesito `universal.company`, `universal.idealCustomer`, `domains.inbox.responseTimeTargets`, `domains.inbox.routingCategories`, `domains.quality.escalationTiers`. Si falta algún campo, hago UNA pregunta puntual con la pista de modalidad (app conectada > archivo > URL > pegar texto), escribo de forma atómica, y sigo.

2. **Leo el documento existente si hay uno.** Si `context/support-context.md` existe, lo leo para que la ejecución sea una actualización, no una reescritura. Conservo todo lo que ya está afinado; cambio solo lo desactualizado o lo nuevo.

3. **Insisto en lenguaje textual.** Antes de redactar, te pido 2 o 3 frases textuales de clientes o tickets de ejemplo: palabras de fricción, detalles repetidos. Si `voice-samples/` tiene entradas, las analizo primero.

4. **Redacto el documento (~400-700 palabras, con criterio propio, directo).** Estructura, en este orden:

   1. **Resumen del producto**  -  un párrafo: qué es el producto, para quién es, sus áreas clave (funciones/flujos), modelo de precios, autoservicio vs con acceso controlado.
   2. **Segmentos de clientes + lista VIP**  -  segmentos nombrados + cuentas VIP. Los VIP obtienen P1 sin importar el contenido.
   3. **Tono + voz**  -  tono por defecto (directo / cálido / humano), 3-5 muestras textuales de `voice-samples/` si existen (si no, `TBD, corre calibrate-my-voice`), frases prohibidas.
   4. **Niveles de tiempo de respuesta**  -  definiciones P1 / P2 / P3 / P4 + expectativas de tiempo de respuesta por nivel. Especifico qué califica en cada nivel.
   5. **Reglas de enrutamiento**  -  árbol de decisión:
      - Error → destino en el rastreador (Linear / GitHub, desde la configuración o preguntando); capturo la información (reproducción, versión, cliente).
      - Solicitud de función → `requests.json`, con atribución del cliente.
      - Caída del servicio → referencia al playbook (`playbooks/p1-outage.md` una vez redactado).
      - Facturación → dosier de Stripe + quien aprueba reembolsos (el fundador por defecto).
   6. **Detalles conocidos**  -  lista breve de particularidades del producto respondidas 10 o más veces. 3-10 viñetas.

5. **Marco los vacíos con honestidad.** Si una sección queda escasa, escribo `TBD, {qué deberías traer la próxima vez}`. Nunca invento.

6. **Escribo de forma atómica.** Escribo en `context/support-context.md.tmp`, renombro a `context/support-context.md`. Un solo archivo bajo `context/`, NO bajo `.agents/` ni `.houston/` (el watcher lo ignora).

7. **Agrego a `outputs.json`.** Leo el arreglo existente, agrego una nueva entrada (`type: "support-context"`, `domain: "quality"`, título que resume el cambio), escribo de forma atómica.

8. **Te resumo.** Un párrafo: qué escribí, qué sigue como `TBD`, el próximo paso ("siguiente: corre `calibrate-my-voice`" / "siguiente: dime qué rastreador usas para errores"). Te recuerdo que todas las demás skills ahora operan contra este documento.

## Resultados

- `context/support-context.md` (en la raíz del agente, documento vivo)
- Agrega a `outputs.json` con `type: "context-edit"`.
