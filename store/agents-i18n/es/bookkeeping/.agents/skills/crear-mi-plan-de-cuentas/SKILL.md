---
name: crear-mi-plan-de-cuentas
title: Crear mi plan de cuentas
description: "Redacto un plan de cuentas optimizado para startups, ajustado a tu entidad, método contable y modelo de ingresos, con desgloses de gastos operativos de I+D / Ventas y Marketing / Generales y Administrativos, líneas de ingresos diferidos y PTO devengado, líneas de notas SAFE y capital convertible, y una sublínea de efectivo por cada cuenta bancaria registrada. Permite revisiones en el mismo documento que preservan cada código sin cambios para que las categorizaciones históricas no se redirijan en silencio. Nunca envío el plan de cuentas a QuickBooks ni a Xero, tú o tu contador lo replican allí."
version: 1
category: Contabilidad
featured: no
image: ledger
integrations: [hubspot, stripe, quickbooks, xero, notion, slack]
---


# Crear Mi Plan de Cuentas

El plan de cuentas es la forma de cada estado financiero que produzco. Redacto el tuyo con una postura pensada para startups en etapa temprana: visibilidad de I+D para el crédito fiscal, separación de Ventas y Marketing / Generales y Administrativos para el análisis de margen bruto, líneas de pasivo listas para devengo aunque estés en base de efectivo, y una sublínea de efectivo por cada cuenta bancaria registrada para que las conciliaciones calcen limpiamente. Las revisiones se guardan aquí y preservan cada código sin cambios.

Nunca envío el plan de cuentas a QuickBooks ni a Xero. Tú o tu contador lo replican en el sistema contable.

## Cuándo usarlo

- "redacta nuestro plan de cuentas" / "necesitamos uno" / "todavía no
  tenemos uno".
- "revisa el plan de cuentas para separar I+D" / "agrega una línea de ingresos diferidos" /
  "separa el hosting del costo de ventas".
- Llamado implícitamente por `import-my-prior-books` cuando la exportación anterior
  incluye un plan de cuentas y el nuestro no existe.
- Llamado implícitamente por `process-my-statements` en el Paso 1 si el plan de cuentas está ausente,
  pero solo después de confirmar en el momento.

## Conexiones que necesito

Ejecuto el trabajo externo a través de Composio. Antes de que esta habilidad se ejecute, verifico que las categorías siguientes estén conectadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, me detengo.

- **QuickBooks Online o Xero** (contabilidad) - opcional, me permite leer tu plan de cuentas existente en tu sistema contable como punto de partida.
- **Stripe** (facturación) - opcional, me ayuda a confirmar cómo fluyen los ingresos y las comisiones del procesador si facturas a través de Stripe.

Esta habilidad funciona completamente sin conexión, a partir de lo que me cuentes. Ninguna conexión bloquea la ejecución, las conexiones solo hacen que el primer borrador sea más preciso.

## Información que necesito

Leo primero tu contexto contable. Por cada campo requerido que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: aplicación conectada > archivo > URL > texto pegado) y espero.

- **Tu tipo de entidad** - Requerido. Por qué: define la sección de patrimonio (una C-corp tiene acciones comunes / preferentes / APIC; una LLC tiene capital de miembro). Si falta, pregunto: "¿Cuál es el tipo de entidad, C-corp, S-corp, LLC, u otra?"
- **Contabilidad de efectivo o devengado** - Requerido. Por qué: define si incluyo por defecto las líneas de ingresos diferidos y PTO devengado. Si falta, pregunto: "¿Llevamos los libros en base de efectivo o de devengado?"
- **Tus cuentas bancarias y tarjetas** - Requerido. Por qué: creo una sublínea de efectivo por cada cuenta bancaria para que las conciliaciones calcen limpiamente. Si falta, pregunto: "¿Qué cuentas bancarias y tarjetas de crédito usa el negocio? Conectar QuickBooks o tu feed bancario es la forma más fácil."
- **Tu modelo de ingresos** - Requerido. Por qué: suscripción SaaS, uso, servicios o mezcla cambia qué líneas de ingresos incluyo. Si falta, pregunto: "¿Cómo genera dinero el negocio, suscripciones recurrentes, basado en uso, servicios, o una mezcla?"
- **Tu postura de compensación en acciones** - Opcional. Por qué: ISO / NSO / RSU activa una línea de gasto de compensación en acciones y una línea de patrimonio APIC-SBC. Si falta, pregunto: "¿Ya otorgan acciones a los empleados? Si no tienes eso, sigo sin las líneas de compensación en acciones y las agregamos después."

## Pasos

1. **Leer la configuración.** Cargar `config/context-ledger.json`. Campos
   requeridos para un buen primer borrador del plan de cuentas:
   - `universal.company.entityType` (define la sección de patrimonio, una c-corp
     tiene acciones comunes + preferentes + APIC; una LLC tiene capital de miembro).
   - `universal.accountingMethod` (base solo de efectivo puede omitir las líneas de ingresos
     diferidos y PTO devengado si se solicita, por defecto se incluyen para que el cambio a
     devengado sea sin fricción).
   - `domains.banks.accounts[]` (una sublínea de Efectivo por cada cuenta bancaria,
     nombrada con los últimos 4 dígitos para que las conciliaciones calcen 1 a 1).
   - `domains.revenue.model` (el modelo de uso obtiene una sublínea de Ingresos por Uso;
     los servicios obtienen Ingresos por Servicios separados de los
     recurrentes).
   - `domains.payroll.stockCompPosture` (una postura distinta de "none" obtiene
     líneas de gasto de compensación en acciones + patrimonio APIC-SBC).

   Cualquier campo requerido faltante: hacer UNA pregunta puntual
   (pista de modalidad: aplicación conectada > archivo > URL > texto pegado), escribir
   atómicamente, continuar.

2. **Leer el plan de cuentas existente si hay uno.** Si
   `config/chart-of-accounts.json` existe, cargarlo. Esta ejecución es una
   revisión, no una reescritura. **Preservar cada código sin cambios.**
   Proponer diferencias (agregados / renombrados / reasignación de padre) y confirmar con el usuario
   antes de escribir. Nunca reasignar un código de un nombre a un concepto
   diferente, eso redirige en silencio cada transacción histórica que
   coincidía con el código anterior.

3. **Armar el plan de cuentas optimizado para startups.** Usar la estructura de abajo. Los códigos
   son cadenas de texto, mantener el orden numérico dentro de cada tipo para que los reportes
   se ordenen de forma natural.

   **Activos (10000-19999)**
   - Efectivo, una sublínea por cada cuenta bancaria de
     `domains.banks.accounts[]`, nombrada `Efectivo - {banco} {últimos 4}`. Formato del
     código de cuenta: `1{nnnn}`. Agregar la línea `Efectivo - Stripe` si Stripe
     está conectado como procesador de pagos.
   - Cuentas por cobrar.
   - Renta Prepagada, SaaS Prepagado, Seguro Prepagado (líneas separadas,
     se amortizan en calendarios diferentes).
   - Activos Fijos (más su par Depreciación Acumulada, un
     activo negativo, mostrado como línea de contra).

   **Pasivos (20000-29999)**
   - Cuentas por pagar.
   - Nómina Devengada, PTO Devengado (separado de la nómina, el PTO
     impacta la línea de gasto con el tiempo, no en el momento del corte).
   - Gastos Devengados (genérico).
   - Ingresos Diferidos, corto plazo (menos de 12 meses) + largo plazo (más de 12 meses) como
     líneas separadas para la división del balance general.
   - Notas SAFE, Notas Convertibles (líneas separadas, tienen una
     postura contable distinta al momento de la conversión).
   - Impuesto sobre la Renta por Pagar.

   **Patrimonio (30000-39999)**
   - C-corp: Acciones Comunes, Acciones Preferentes, APIC, APIC-SBC (si
     la postura de compensación en acciones no es "none"), Utilidades Retenidas.
   - LLC: Capital de Miembro, Retiros de Miembro, Utilidades Retenidas.
   - S-corp: Acciones Comunes, APIC, Distribuciones, Utilidades Retenidas.

   **Ingresos (40000-49999)**
   - Ingresos Recurrentes (ingreso mensual / anual por suscripción).
   - Ingresos Únicos.
   - Ingresos por Uso (solo si `revenue.model ∈ {usage, mix}`).
   - Ingresos por Servicios (solo si `revenue.model ∈ {services, mix}`).
   - Contra-ingreso: Reembolsos y Créditos (negativo).

   **Costo de ventas (50000-59999)**
   - Hosting / Infraestructura (AWS, GCP, Vercel).
   - Comisiones de APIs de Terceros (APIs facturadas por uso que son parte del costo de ventas, no
     herramientas de I+D).
   - Procesamiento de Pagos (Stripe, comisiones de tarjeta).
   - Soporte al Cliente (si el tamaño del equipo es ≥ 10 y existe
     una función de soporte).

   **Gastos operativos (60000-79999)**, un desglose con postura propia hace que el plan de cuentas
   sea útil para una startup. Los prefijos de sección del estado mantienen el estado de resultados agrupado:

   - **I+D** (60000-64999), Salarios de I+D, Contratistas de I+D,
     Software de I+D, Nube de I+D (desarrollo/staging, separado del hosting de costo de ventas),
     Otros de I+D. `statementSection: "operating-expenses.rd"`.
   - **Ventas y Marketing** (65000-69999), Salarios de Ventas y Marketing, Publicidad, Eventos y
     Patrocinios, Herramientas de Ventas y Marketing (HubSpot, Apollo, etc.), Otros de Ventas y Marketing.
     `statementSection: "operating-expenses.sm"`.
   - **Generales y Administrativos** (70000-79999), Salarios de Generales y Administrativos, Legal, Contabilidad, Renta,
     Seguro, SaaS de Generales y Administrativos (Slack, Notion, 1Password, etc.), Suministros de
     Oficina, Viajes y Comidas, Otros Generales y Administrativos.
     `statementSection: "operating-expenses.ga"`.

   **Otros (80000-89999)**, debajo de la línea.
   - Ingreso por Intereses, Gasto por Intereses.
   - Ganancia / Pérdida Cambiaria.
   - Ganancia / Pérdida por Disposición de Activos Fijos.

   **Suspenso (99999)**, `statementSection:
   "operating-expenses.ga"` para que sea visible en el estado de resultados. Coincide con el
   `universal.suspenseCode` del contexto contable.

4. **Esquema.** Cada fila:

   ```ts
   {
     code: string;             // SIEMPRE una cadena de texto, nunca un número
     name: string;
     type: "asset" | "liability" | "equity" | "revenue" | "cogs" | "expense";
     parent?: string;          // código de la fila padre para la vista agrupada
     statementSection: string; // p. ej. "operating-expenses.rd", "assets.current"
     description?: string;     // una línea de desambiguación para quien categoriza
   }
   ```

5. **Validar antes de escribir.**
   - Cada `code` es texto y único en todo el plan de cuentas.
   - Los códigos se ordenan numéricamente dentro de cada `type` (nunca un 60500 entre
     65000 y 65500, mantener los rangos limpios).
   - Cada `type` tiene al menos una fila (ninguna sección vacía).
   - Cada `parent` (si está definido) resuelve a una fila del plan de cuentas.
   - Cada `statementSection` es una de las secciones permitidas:
     `assets.current`, `assets.noncurrent`, `liabilities.current`,
     `liabilities.noncurrent`, `equity`, `revenue`,
     `contra-revenue`, `cogs`, `operating-expenses.rd`,
     `operating-expenses.sm`, `operating-expenses.ga`, `other`.

6. **Escribir de forma atómica.** Escribir `config/chart-of-accounts.json.tmp`,
   luego renombrar. Actualizar
   `config/context-ledger.json → universal.coa` con
   `{present: true, path: "config/chart-of-accounts.json", framework,
   lastUpdatedAt}` (leer-fusionar-escribir).

7. **Resguardo de revisión.** Si es una revisión:
   - Comparar contra el plan de cuentas anterior. Para cualquier código **eliminado**, revisar
     `config/prior-categorizations.json` y advertir si algún proveedor
     todavía mapea a ese código, el usuario debe reasignar los proveedores o mantener
     el código.
   - Para cualquier código **renombrado** (mismo código, nombre diferente), actualizar
     `name` en el lugar, las categorizaciones ancladas al `code` quedan seguras.
   - Para cualquier código **agregado nuevo**, registrarlo en el resumen para el usuario
     para que el fundador sepa que existe de cara a la próxima ejecución.

8. **NO añadir a `outputs.json`.** El plan de cuentas es configuración, no un
   entregable.

9. **Resumir al usuario.** Conteos por tipo, cualquier agregado, renombrado o
   advertencia, siguiente paso ("suelta los estados de cuenta en
   `statements/_inbox/` y categorizaré contra este plan de cuentas").

## Resultados

- `config/chart-of-accounts.json`, plan de cuentas autoritativo, esquema según
  el Paso 4.
- `config/context-ledger.json`, `universal.coa` actualizado
  (leer-fusionar-escribir).

Sin entrada en `outputs.json`.
