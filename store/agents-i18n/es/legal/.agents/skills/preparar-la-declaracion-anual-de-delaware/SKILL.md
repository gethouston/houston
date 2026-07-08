---
name: preparar-la-declaracion-anual-de-delaware
title: "Preparar la declaración anual de Delaware"
description: "Prepárate para tu reporte anual de Delaware y el impuesto de franquicia (vence el 1 de marzo de cada año). Hago el cálculo de dos formas y elijo la más barata, que suele ser de 10 a 100 veces menor que la cifra alarmante que Delaware muestra por defecto. Recibes una guía paso a paso de exactamente qué ingresar en el sitio web del estado. Tú presentas, yo preparo."
version: 1
category: Entidad
featured: no
image: scroll
integrations: [googledocs]
---

# Preparar la declaración anual de Delaware

Toda C-corp de Delaware debe presentar el impuesto de franquicia y el
reporte anual antes del **1 de marzo**. La calculadora en línea por
defecto usa el método de Acciones Autorizadas y muestra una cifra
alarmante, a menudo $75K o más para una startup estándar con 10
millones de acciones autorizadas. El **método de Capital de Valor Par
Asumido** casi siempre produce un impuesto mucho menor (a menudo entre
$400 y $1,000 para una startup pequeña). Calcula ambos métodos y
señala el ahorro.

## Cuándo usarlo

- "Prepara mi reporte anual de Delaware para {year}."
- "Se acerca el impuesto de franquicia de Delaware."
- Activado por `track-deadlines-and-signatures` (scope=deadlines) cuando el plazo del
  1 de marzo entra en la ventana de 90 días.
- El fundador recibió una factura alarmante de Delaware y quiere que se recalcule.

## Pasos

1. **Lee el contexto compartido.** Lee `context/legal-context.md`.
   Si falta o está vacío, pregunta al usuario en lenguaje sencillo: "Primero necesito unos datos básicos sobre tu empresa (estado de constitución, acciones autorizadas, directores). ¿Quieres configurarlos ahora?" Luego ejecuta `set-up-my-legal-info` si dice que sí. Detente hasta que eso esté hecho.

2. **Lee la configuración.** `config/entity.json`: confirma que
   `stateOfIncorporation === "DE"`. Si no, responde: "Esto solo
   aplica para entidades de Delaware; tu entidad está registrada en
   {state}." Detente.

3. **Reúne los datos para la presentación.** Lee de `legal-context.md`:
   - Nombre legal de la entidad
   - Número de archivo (número de archivo del estado de Delaware, 7 dígitos)
   - Acciones autorizadas (por clase de acción: comunes + cualquier preferente)
   - Valor par por acción (típicamente $0.0001 o $0.00001 para
     startups)
   - Nombre y dirección del agente registrado
   - Fecha de constitución

   Más datos para el recálculo (pregunta al fundador si faltan, uno a la vez):
   - **Acciones emitidas al cierre del año fiscal** (por clase). Extrae
     de `composio search cap-table` (Carta / Pulley); si no está
     conectado, pregunta.
   - **Activos brutos al cierre del año fiscal** (del balance general:
     línea de activos totales). Si es pre-ingresos con menos de $50K en
     el banco, normalmente basta con "el efectivo disponible".
   - **Directores**: nombre y cargo de cada miembro de la junta.
   - **Funcionarios**: nombre y cargo de cada uno (mínimo Presidente,
     Secretario, Tesorero; en una startup de un solo fundador,
     normalmente esa persona ocupa los tres cargos).
   - **Domicilio principal del negocio**: dirección (la oficina en casa
     del fundador o la dirección del agente registrado están bien).

4. **Ejecuta ambos cálculos de impuesto de franquicia.**

   **Método A, Acciones Autorizadas (por defecto, usualmente más alto):**
   - ≤ 5,000 acciones: $175 fijo (mínimo).
   - 5,001-10,000 acciones: $250 fijo.
   - > 10,000 acciones: $250 + $85 por cada 10,000 acciones adicionales
     (o fracción), con un tope de $200,000.
   - Startup con 10 millones de acciones autorizadas → ~$85,165 con este método.

   **Método B, Capital de Valor Par Asumido:**
   1. `assumedParValueCapital = (grossAssets / totalIssuedShares)
      * totalAuthorizedShares`.
   2. Impuesto = `$400 por cada $1,000,000 de assumedParValueCapital`
      (mínimo $400; máximo $200,000).
   3. Startup con 10 millones autorizadas, 8 millones emitidas, $100K
      en activos brutos → `(100000 / 8000000) * 10000000 = $125,000`
      de valor par asumido → impuesto de $400 (toca el piso).

   Elige el **menor** entre A y B. El estatuto de Delaware permite
   explícitamente la elección del método de Capital de Valor Par
   Asumido. Cita **8 Del. C. §503**.

5. **Muestra ambas cifras y el ahorro.** Ejemplo de aviso:
   > "Método de Acciones Autorizadas por defecto: $85,165.
   > Método de Capital de Valor Par Asumido: $400.
   > Ahorro: $84,765. Elige Capital de Valor Par Asumido en el
   > formulario de presentación, hay un botón de opción en el portal
   > de Delaware para esto."

6. **Arma el paquete de presentación.** Escribe un solo archivo markdown en
   `annual-filings/de-{year}.md` con:

   - **Resumen**: entidad, año, total a pagar (el menor entre los
     métodos A/B), elección que se está haciendo, plazo (1 de marzo, {year}).
   - **Detalle del cálculo**: ambos métodos, datos usados, resultado.
   - **Contenido del reporte anual**: nombre de la entidad, número de
     archivo, domicilio principal del negocio, teléfono, directores
     (nombre + dirección), funcionarios (nombre + dirección + cargo),
     acciones emitidas.
   - **Guía paso a paso del portal**: URL
     (https://corp.delaware.gov/paytaxes/), inicia sesión con el
     número de archivo de la entidad, selecciona reporte anual e
     impuesto de franquicia, ingresa funcionarios y directores,
     **selecciona "Assumed Par Value" en el botón de opción de
     elección del impuesto de franquicia**, ingresa activos brutos y
     acciones emitidas, paga.
   - **Aviso de recargo por atraso**: recargo de $200 más 1.5% de
     interés mensual; si falla dos años consecutivos, la entidad se
     declara nula.
   - **Recordatorios**: renovación del agente registrado (factura
     separada del agente), consentimiento anual de la junta (proceso
     separado).

7. **Escribe de forma atómica** (`*.tmp` → renombrar).

8. **Agrega a `outputs.json`**: `{ id, type: "annual-filing",
   title, summary, path, status: "draft", createdAt, updatedAt,
   attorneyReviewRequired }`. Cambia `attorneyReviewRequired: true`
   si la tabla de capitalización tiene algo inusual: SAFEs o
   convertibles sin convertir, varias clases de preferentes, acciones
   emitidas a un valor par no estándar, acciones de fundador aún no
   registradas, o cualquier discrepancia entre la tabla de
   capitalización y las emisiones consentidas por la junta.

9. **Marca la fila del calendario como hecha** una vez que el fundador
   confirme que presentó. Actualiza `deadline-calendar.json`, la fila
   `type: "delaware-franchise-tax"` → `status: "done"`; la fila del
   próximo año se crea el 1 de enero.

10. **Resume para el usuario.** Lenguaje sencillo. Muestra ambas cifras
    de impuesto, el ahorro, el plazo del 1 de marzo, el enlace al sitio
    de presentación de Delaware, y una línea final: "Ya dejé preparado
    exactamente qué ingresar. Ve a esa página cuando estés listo y
    sigue los pasos." Nunca nombres archivos ni rutas.

## Resultados

- `annual-filings/de-{YYYY}.md`
- Se agrega a `outputs.json` con `type: "annual-filing"`.
