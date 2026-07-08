---
name: planear-un-viaje
title: "Planear un viaje"
description: "Obtén un paquete de viaje redactado para que puedas viajar sin descuidar el resto de tu semana. Armo un resumen del viaje, un itinerario con criterios de búsqueda de vuelos y hoteles, y una lista de equipaje adaptada al destino y al tipo de viaje. Dime a dónde y cuándo; yo redacto, tú reservas."
version: 1
category: Operaciones
featured: no
image: clipboard
integrations: [googlecalendar, gmail]
---


# Planear un viaje

## Cuándo usarla

- "voy a {city}" / "planea mi viaje a {X}" / "planea un viaje de principio a fin".
- "vuelos para {conference}" / "tengo una visita a cliente en {X}".
- "arma mi paquete de viaje".

## Conexiones que necesito

Ejecuto todo el trabajo externo a través de Composio. Antes de ejecutar esta skill verifico que las categorías de abajo estén vinculadas. Si falta alguna → nombro la categoría, te pido conectarla desde la pestaña de Integraciones y me detengo.

- **Calendario** (Google Calendar, Outlook) - Requerido. Me permite ver las reuniones existentes durante la ventana del viaje y extraer eventos en el destino.
- **Bandeja de entrada** (Gmail, Outlook) - Opcional. Me ayuda a encontrar confirmaciones de reserva o itinerarios existentes.
- **Proveedores de viaje** (búsqueda de vuelos u hoteles) - Opcional. Si están conectados muestro opciones reales; si no, escribo los criterios de búsqueda y tú reservas por tu cuenta.

Si no hay calendario conectado, me detengo y te pido conectar primero tu calendario.

## Información que necesito

Primero leo tu contexto de operaciones. Por cada campo requerido que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > pegar texto) y espero.

- **Destino y fechas** - Requerido. Por qué lo necesito: nada funciona sin el dónde y el cuándo. Si falta, pregunto: "¿A dónde vas y en qué fechas? Un rango sirve si todavía tienes flexibilidad."
- **Propósito del viaje** - Requerido. Por qué lo necesito: una visita a cliente, una conferencia, un offsite y un viaje personal reciben itinerarios y listas de equipaje distintos. Si falta, pregunto: "¿Cuál es el propósito del viaje: visita a cliente, conferencia, offsite o personal?"
- **Preferencias de viaje** - Requerido. Por qué las necesito: redacto según tus preferencias reales en vez de adivinar. Si faltan, pregunto: "¿Cuáles son tus preferencias de viaje: aerolínea preferida, asiento, cadena de hoteles, necesidades alimentarias, algo que siempre deba incluir?"
- **Tu zona horaria** - Opcional. Por qué la necesito: detecta conflictos de agenda durante la ventana del viaje. Si no la tienes, sigo adelante con TBD usando el valor predeterminado de tu contexto operativo.

## Pasos

1. **Leo `context/operations-context.md`.** Si falta o está vacío, me detengo. Le pido al usuario ejecutar primero `set-up-my-ops-info`. Los contactos clave + las prioridades anclan la sección de "¿qué reuniones tengo mientras estoy allá?".

2. **Aclaro el viaje.** Extraigo del mensaje: destino(s), fechas (o rango), propósito (visita a cliente / conferencia / offsite / personal), con quién se viaja (solo / en equipo). Si faltan las fechas o el destino y son relevantes, hago UNA pregunta.

3. **Leo las preferencias de viaje.** Leo `config/travel-prefs.json`. Si falta o está vacío, hago UNA pregunta: "¿Cuáles son tus preferencias de viaje: aerolínea preferida, asiento (pasillo/ventana), cadena de hoteles, necesidades alimentarias, accesibilidad?" Escribo la respuesta en `config/travel-prefs.json` y continúo.

4. **Leo la agenda.** Leo `config/schedule-preferences.json` para la zona horaria. Verifico conflictos de calendario durante la ventana del viaje vía `composio search calendar` (extraigo los eventos desde la fecha de salida hasta la de regreso).

5. **Resuelvo las conexiones de viaje.** `composio search travel` → verifico los proveedores de viaje conectados (búsqueda de vuelos + hoteles). Anoto las categorías disponibles. Si no hay ninguno conectado, procedo solo con criterios de búsqueda + anoto que el usuario reserva manualmente (sin suponer un proveedor fijo).

6. **Genero el id del viaje** - `{YYYY-MM-DD}-{dest-slug}` (destino en kebab-case, p. ej. `2026-05-12-sfo`).

7. **Escribo `travel/{trip-id}/trip.md`** - el documento resumen. Estructura:

   ```markdown
   # Viaje - {destination}, {dates}

   ## Propósito
   {1-2 líneas: visita a cliente / conferencia / offsite / personal}

   ## Fechas
   Salida {YYYY-MM-DD} - Regreso {YYYY-MM-DD} ({N noches})

   ## Destinos
   - {city}, {country/state} - {nights}

   ## Reuniones clave durante el viaje
   - {date} - {attendee or event} - preparación: {ready | missing}
   - ... (extraídas del calendario conectado para los eventos en la ventana del viaje)

   ## Preguntas abiertas
   - {cualquier cosa que el usuario deba aclarar antes de reservar}
   ```

8. **Escribo `travel/{trip-id}/itinerary.md`.** Estructura:

   ```markdown
   ## Vuelos

   ### Ida
   - Criterios de búsqueda: {origin} → {destination}, {date},
     {airline pref}, {seat pref}, {max stops}, {price ceiling if
     mentioned}
   - Opciones candidatas (si hay un proveedor conectado): {list}

   ### Regreso
   - Criterios de búsqueda: {dest} → {origin}, {date}, {same prefs}
   - Opciones candidatas: {list}

   ## Hoteles
   - Criterios de búsqueda: {chain pref}, {nights}, {neighborhood near
     key meetings}, {price ceiling if mentioned}
   - Opciones candidatas: {list}

   ## Transporte terrestre
   - Aeropuerto → hotel → reuniones
   - Modo preferido: {ride-share / rental / public}

   ## Reservas pendientes
   - [ ] Vuelo de ida
   - [ ] Vuelo de regreso
   - [ ] Hotel
   - [ ] Transporte terrestre
   ```

9. **Escribo `travel/{trip-id}/packing.md`** - lista de equipaje adaptada al clima del destino (mejor estimación a partir del destino + las fechas; anoto la suposición), al tipo de viaje (una visita formal a cliente vs una conferencia vs un offsite: la ropa cambia) y a `config/travel-prefs.json` (alimentación, accesibilidad). Secciones: `## Essentials`, `## Work`, `## Clothing`, `## Health & toiletries`, `## Destination-specific`.

10. **Escrituras atómicas** - `*.tmp` → renombrar por archivo.

11. **Agrego a `outputs.json`** con `type: "travel-pack"` y estado "draft" hasta que el usuario apruebe las reservas.

12. **Resumo para el usuario.** "Paquete de viaje listo en `travel/{trip-id}/`. ¿Quieres que busque opciones de vuelo vía {available-provider} cuando confirmes las fechas, o reservas por tu cuenta? Además, ¿debería bloquear tu calendario durante el viaje?"

## Resultados

- `travel/{trip-id}/trip.md`
- `travel/{trip-id}/itinerary.md`
- `travel/{trip-id}/packing.md`
- Posiblemente `config/travel-prefs.json` escrito en la primera ejecución
- Agrega a `outputs.json` con `type: "travel-pack"`.

## Lo que nunca hago

- **Reservar** vuelos, hoteles o transporte terrestre sin la aprobación explícita del usuario sobre una opción específica.
- **Cobrar** a ninguna tarjeta.
- **Comprometerme** a fechas de viaje en tu nombre.
- **Inventar** un evento en el destino que no esté en el calendario ni haya sido nombrado por el usuario.
