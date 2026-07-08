---
name: rastrear-plazos-de-cumplimiento
title: Rastrear plazos de cumplimiento
description: "Mantengo un calendario vivo de cumplimiento de personal: estado de los formularios I-9 y W-4, renovaciones de visa, plazos de adquisición de acciones (vesting), fechas del ciclo de evaluaciones y la frecuencia de actualización de políticas. Reviso tu sistema de Recursos Humanos, actualizo el calendario directamente y te aviso antes de que algo venza."
version: 1
category: Personal
featured: no
image: busts-in-silhouette
integrations: [googlesheets, notion]
---


# Rastrear plazos de cumplimiento

## Cuándo usarla

- Explícito: "arma el calendario de cumplimiento", "qué viene en cumplimiento de RR.HH.", "qué renovaciones de I-9 / W-4 / visa vencen", "actualiza el calendario de cumplimiento".
- Implícito: se activa mensualmente, o cuando un nuevo empleado termina su onboarding (nuevo plazo de I-9), o cuando se registra una fecha de visa.
- Frecuencia: bajo demanda y actualización mensual.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de correr esta habilidad reviso que las categorías de abajo estén conectadas. Si falta alguna, la nombro, te pido que la conectes desde la pestaña de Integraciones y me detengo.

- **Plataforma de RR.HH. (Gusto, Deel, Rippling, Justworks)**: para traer fechas de inicio, autorización de trabajo, vesting. Obligatorio.
- **Calendario (Google Calendar, Outlook)**: para enviar recordatorios de fechas si los quieres en tu calendario. Opcional.
- **Hojas de cálculo (Google Sheets, Airtable)**: para reflejar el calendario en finanzas u operaciones si hace falta. Opcional.
- **Documentos (Notion)**: para compartir el calendario en el espacio de trabajo de tu equipo. Opcional.

Si tu plataforma de RR.HH. no está conectada, me detengo y te pido que conectes Gusto, Deel, Rippling o Justworks desde la pestaña de Integraciones.

## Información que necesito

Primero leo tu contexto de personal. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje simple (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **Roster con fechas de inicio y estatus**: Obligatorio. Por qué lo necesito: cada entrada se rastrea a un registro de empleado. Si falta, pregunto: "Conecta tu plataforma de RR.HH. para que pueda traer fechas de inicio y autorización de trabajo, o pega la lista del equipo con estos datos."
- **Ritmo del ciclo de evaluaciones**: Obligatorio. Por qué lo necesito: los anclajes del ciclo de evaluaciones son parte del calendario. Si falta, pregunto: "¿Las evaluaciones son anuales, semestrales o trimestrales, y cuándo empieza el próximo ciclo?"
- **Huella de registro estatal**: Opcional. Por qué lo necesito: las declaraciones estatales dependen de dónde viven los empleados. Si no la tienes, sigo con TBD en las entradas estatales.
- **Política de vesting de equity**: Opcional. Por qué lo necesito: las fechas de cliff y aceleración determinan los avisos de 30 días. Si no la tienes, sigo con TBD en las entradas de equity.
- **Fecha de renovación de PTO**: Opcional. Por qué lo necesito: ancla la entrada anual de renovación de PTO. Si no la tienes, sigo con TBD.

## Pasos

1. **Leer el documento de contexto de personal.** Leo `context/people-context.md` para el ritmo del ciclo de evaluaciones (anual / semestral / trimestral, próxima fecha de ciclo) y cualquier frecuencia de actualización de políticas. Si falta o está vacío, le digo al usuario: "Primero necesito tu contexto de personal, corre la habilidad set-up-my-people-info." Me detengo.
2. **Leer el registro.** `config/context-ledger.json` (plataforma de RR.HH. de solo lectura, nunca modifico registros). Si la plataforma de RR.HH. no está conectada, hago UNA pregunta puntual con sugerencia de modalidad ("Conecta tu plataforma de RR.HH., Gusto, Deel, Rippling o Justworks, en la pestaña de Integraciones para que pueda traer fechas de inicio, estatus de autorización de trabajo y calendarios de vesting").
3. **Descubrir herramientas vía Composio.** Corro `composio search hris` para el slug de perfil de solo lectura, más `composio search calendar` para la herramienta de calendario si el usuario quiere que envíe recordatorios.
4. **Escanear los registros de empleados (solo lectura).** Por empleado, traigo:
   - Fecha de inicio (referencia para la regla de los 3 días del I-9).
   - Fecha del último refresh del W-4.
   - Vencimiento de autorización de trabajo o visa (si aplica).
   - Inicio del vesting de equity, fecha de cliff y términos de aceleración (si aplica).
   - Fecha de anclaje del ciclo de evaluaciones según el ritmo en el contexto de personal.
5. **Producir entradas de calendario por categoría:**
   - **Plazos de I-9**: regla de los 3 días. Marco a cualquiera que siga dentro de la ventana de 3 días.
   - **Tiempos de renovación de W-4**: anclajes de renovación anual.
   - **Vencimientos de visa**: avisos de 90 / 60 / 30 días por empleado.
   - **Requisitos de registro estatal**: obligaciones por estado según nuevas contrataciones en ese estado.
   - **Fechas del ciclo de evaluaciones**: derivadas del ritmo en el contexto de personal.
   - **Cliffs de vesting de equity**: aviso 30 días antes del cliff.
   - **Fechas de renovación de política de PTO**: renovación anual o fiscal.
6. **Actualizar el documento vivo.** Escribo el calendario completamente actualizado de forma atómica en `compliance-calendar.md` en la raíz del agente (NO en una subcarpeta): escribo `compliance-calendar.md.tmp`, renombro sobre el archivo existente. Estructura: una sección por cada categoría de arriba, entradas ordenadas por fecha ascendente, cada entrada con `{ employee-slug (si aplica), due-date, days-out, action }`. Línea "Actualizado: {timestamp}" al inicio del archivo.
7. **Agregar a `outputs.json`**: leo el arreglo existente, agrego una nueva entrada por cada actualización: `{ id, type: "compliance", title: "Compliance calendar refresh {YYYY-MM-DD}", summary, path: "compliance-calendar.md", status: "ready", createdAt, updatedAt }`. Cada actualización sustancial es una entrada NUEVA en `outputs.json`, el archivo en la raíz del agente se sobrescribe, pero el registro de resultados es de solo agregar, así que el panel muestra el historial. Escribo de forma atómica.
8. **Resumir al usuario**: un párrafo con el número de entradas por categoría, la acción más próxima, y la ruta a `compliance-calendar.md`. Ofrezco enviar recordatorios de fechas a la herramienta de calendario conectada.

## Nunca inventar

Cada entrada se rastrea a un registro real de la plataforma de RR.HH. o a un anclaje real del contexto de personal. Si falta un dato, lo marco como TBD. No adivino fechas.

## Nunca modificar

Los registros de la plataforma de RR.HH. y de nómina son de solo lectura desde este agente. La habilidad lee, escanea y produce un calendario en markdown, nunca escribe de vuelta a la plataforma de RR.HH.

## Resultados

- `compliance-calendar.md` en la raíz del agente (documento vivo, actualizado de forma atómica en el mismo lugar).
- Se agrega a `outputs.json` con tipo `compliance` en cada actualización, el panel muestra el historial de actualizaciones aunque el archivo del calendario se sobrescriba.
