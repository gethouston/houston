---
name: etiquetar-mi-gasto-de-i-d
title: "Etiquetar mi gasto de I+D"
description: "Etiqueto tu gasto calificado de I+D para respaldar la Sección 174 y el crédito federal de I+D. Agrupo el gasto en las cuatro categorías del IRS (salarios calificados por rol de empleado y proporción de tiempo, suministros, arrendamiento de nube / computadoras, investigación contratada al 65%), lo asigno entre tus proyectos (o un solo grupo 'I+D sin asignar' si no tienes una lista de proyectos), y señalo las exclusiones típicas (correcciones posteriores al lanzamiento, análisis de rutina, investigación financiada por terceros). Solo un paquete de respaldo, tu preparador de impuestos presenta el Formulario 6765 y cualquier equivalente estatal."
version: 1
category: Contabilidad
featured: no
image: ledger
---


# Etiquetar mi gasto de I+D

Respaldo para la Sección 174 y el crédito de I+D del año fiscal. Agrupo el gasto calificado en las cuatro categorías del IRS, salarios, suministros, arrendamiento de nube / computadoras, investigación contratada al 65%, y lo asigno por proyecto cuando tienes uno. Las exclusiones (análisis de rutina, trabajo posterior al lanzamiento, investigación financiada por terceros, gastos generales y administrativos de I+D) se listan con citas para que tu preparador de impuestos pueda auditar cada decisión. Solo de respaldo, nunca presento el Formulario 6765.

## Cuándo usarla

- "etiqueta el gasto de I+D para el crédito" / "desglose de la Sección 174" / "clasifica los gastos de I+D de {year}".
- Llamada por `hand-off-to-my-tax-preparer` cuando `domains.tax.rdCreditEligible == "yes"`.
- Antes de la entrega de fin de año, muestra las etiquetas de proyecto faltantes o las decisiones inciertas entre I+D y gastos generales y administrativos.

## Conexiones que necesito

Ejecuto trabajo externo a través de Composio. Antes de que esta habilidad corra, verifico que las categorías de abajo estén vinculadas. Si falta alguna, nombro la categoría, te pido que la conectes desde la pestaña de Integraciones, y me detengo.

- **Proveedor de nómina** (Gusto, Rippling, Justworks, Deel, ADP), fuente preferida para los salarios por empleado y rol, que determina el grupo de salarios calificados. Obligatorio si tienes empleados.
- **QuickBooks Online o Xero** (contabilidad), complemento opcional para pagos a proveedores y gasto de contratistas si no puedo verlos en el historial de ejecuciones.

Si no existe conexión de nómina y sí tienes empleados, me detengo y te pido que conectes tu herramienta de nómina, o que sueltes un CSV con el resumen de nómina.

## Información que necesito

Primero leo tu contexto contable. Por cada campo obligatorio que falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app conectada > archivo > URL > texto pegado) y espero.

- **El año fiscal que estás reclamando**, Obligatorio. Por qué: define el rango de fechas en el que agrego el gasto. Si falta, pregunto: "¿Para qué año fiscal estamos clasificando el I+D?"
- **Elegibilidad para el crédito de I+D**, Obligatorio. Por qué: confirma si corro un desglose estilo crédito federal o solo una vista de amortización de la Sección 174. Si falta, pregunto: "¿La empresa planea reclamar el crédito federal de I+D este año, o esto es solo para la amortización de la Sección 174?"
- **El rol de cada empleado y la proporción de su tiempo dedicada a I+D calificado**, Obligatorio. Por qué: determina el grupo de salarios calificados; los ingenieros por defecto van al 100%, producto / diseño menos. Si falta, pregunto: "¿Qué hace cada persona del equipo, y aproximadamente qué proporción de su tiempo es ingeniería o investigación práctica? Si prefieres, empiezo con valores por defecto (ingeniería 100%, producto 50%, diseño 25%, otros 0%) y tú corriges lo que esté mal."
- **Tu lista de proyectos**, Opcional. Por qué: me permite asignar el gasto calificado por proyecto, que es lo que pide el formulario del crédito. Si no la tienes, agrupo todo en un solo bloque "I+D sin asignar".
- **La proporción de I+D en tu gasto de hosting en la nube**, Opcional. Por qué: las empresas antes de generar ingresos suelen tratar el 100% de la nube como I+D; las empresas con ingresos dividen producción vs. I+D. Si falta, pregunto: "¿Qué proporción de tu gasto en AWS / GCP / Vercel es para desarrollo e investigación versus mantener el producto en vivo? Si no lo sabes, uso 100% I+D por defecto si aún no generan ingresos."

## Pasos

1. **Leer el contexto.** Cargo `context/bookkeeping-context.md`, `config/context-ledger.json`, `config/chart-of-accounts.json`. Registro obligatorio: `universal.company`, `domains.payroll`, `domains.tax.rdCreditEligible`. Si `rdCreditEligible == "no"`, advierto pero continúo si el usuario confirma (los créditos estatales / la amortización de la Sección 174 igual usan este desglose).

2. **Determinar el año fiscal.** Uso el año del usuario si lo especifica; si no, el año de borrador actual.

3. **Mapa de rol → % de I+D (única vez, en caché).** Si `domains.payroll.rdWagePctByRole` falta, pregunto una vez: valores por defecto ingeniería 100%, producto 50%, diseño 25%, no técnico 0%; el usuario los ajusta. Escribo de forma atómica.

4. **Lista de proyectos (única vez, en caché).** Si `config/rd-projects.json` no existe, pido al usuario una línea por proyecto (nombre + descripción). Escribo `[{slug, name, description}]` de forma atómica. Si lo rechaza, uso un solo bloque: "I+D sin asignar".

5. **Extraer las transacciones calificadas.** Leo cada `runs/*/run.json` cuyo período se superponga con el año fiscal; también `journal-entries.json` para los asientos contables registrados en el año (devengos de nómina, devengos de nube).

6. **Bloque 1  -  Salarios por servicios calificados.** De los asientos de nómina (o directamente de Gusto / Rippling / Justworks vía Composio): por empleado, obtengo rol + salario bruto, multiplico por el % de I+D del rol, sumo. Cito cada fila por id de asiento contable + nombre del empleado. Excluyo el tiempo no técnico de los fundadores, los roles generales y administrativos, y toda la compensación en acciones (solo salarios).

7. **Bloque 2  -  Suministros.** Transacciones bajo el catálogo de cuentas `"supplies"` / `"rd-supplies"`. Típico para hardware / biotecnología; usualmente $0 para SaaS puro. Solo materiales **consumidos** en investigación, el equipo de capital va por depreciación.

8. **Bloque 3  -  Arrendamiento de computadoras / nube.** Reviso las transacciones de proveedores reconocidos como `{AWS, Amazon Web Services, GCP, Azure, Digital Ocean, Linode, Vercel, Fly.io, Render, Netlify, Heroku, Cloudflare}` más otros de `prior-categorizations.json` bajo códigos de cuenta de nube/hosting. Pregunto al usuario la proporción de I+D (por defecto 100% antes de generar ingresos; las empresas con ingresos dividen producción vs. I+D). Guardo en caché en `domains.tax.cloudRdPct`.

9. **Bloque 4  -  Investigación contratada al 65%.** Transacciones bajo `"contractor"` / `"professional-services"` / `"consulting"` donde el proveedor hace I+D calificado (contratistas de ingeniería, consultores de investigación, fabricación de prototipos). El código limita la inclusión al 65%  -  `qualified = 0.65 * payment`. Cito cada transacción.

10. **Asignar por proyecto.** Asigno cada fila calificada a un proyecto:
    - Nómina: pregunto las divisiones por persona (por defecto: parejo entre proyectos activos). Guardo en caché por persona.
    - Nube: división pareja por defecto a menos que el usuario dé etiquetas de costo por proyecto.
    - Contratistas: infiero de la descripción de la transacción / memo de la factura; si no, confirmo con el usuario.
    - Suministros: infiero de la orden de compra / memo si está disponible.
    Las filas sin asignar van al bloque "I+D sin asignar".

11. **Exclusiones.** Señalo el gasto que parece I+D pero no califica según Treas. Reg. §1.41:
    - Recolección de datos de rutina (analítica de clientes, tableros de BI para operaciones).
    - Mejoras posteriores al lanzamiento comercial (correcciones menores de errores, ajustes estéticos de interfaz en funciones ya lanzadas).
    - Investigación financiada (otra parte es dueña de los resultados Y asume el riesgo).
    - Duplicación de un componente de negocio existente.
    - Gestión / gastos generales y administrativos de I+D (tiempo de gestión de proyecto que no hace investigación calificada).
    - Marketing, estudios de mercado, publicidad.
    Muestro cada uno con citas + la regla invocada. Excluyo del total calificado. El usuario puede anular.

12. **Escribir `compliance/rd-credit/{year}.md`.** Escritura atómica. Estructura:
    - **Resumen**  -  gasto calificado total de I+D; desglose por categoría + proyecto. Un titular: total de gasto de investigación calificado.
    - **Desglose por proyecto**  -  matriz proyecto × categoría con totales de fila y columna.
    - **Detalle por categoría**  -  detalle a nivel de fila por categoría (empleado o proveedor, monto, asignación de proyecto) con citas.
    - **Exclusiones**  -  qué se sacó, con citas + regla.
    - **Notas de decisiones con criterio**  -  supuestos de % por rol, % de I+D de la nube, cualquier proveedor incierto. El usuario decide; yo señalo las opciones.
    - **Nota de presentación**  -  "Solo de respaldo. El preparador de impuestos presenta el Formulario 6765 (federal) y cualquier equivalente estatal. La capitalización de la Sección 174 / amortización a 5 años es un cálculo separado de la declaración."

13. **Agregar a `outputs.json`.** Fila: `{type: "rd-classification", title: "Soporte del crédito de I+D {year}", summary, path, status: "draft", domain: "compliance"}`. Leer-combinar-escribir.

14. **Resumir para el usuario.** Un párrafo: gasto calificado total, totales por categoría, totales por proyecto si hay proyectos definidos, cantidad de decisiones con criterio, recordatorio de que el preparador presenta el Formulario 6765, no yo.

## Resultados

- `compliance/rd-credit/{year}.md` (indexado como `rd-classification`)
- `config/rd-projects.json` (lista de proyectos en caché, si se proporcionó)
- Actualizaciones de registro: `domains.payroll.rdWagePctByRole`, `domains.tax.cloudRdPct`, divisiones de proyecto por empleado
