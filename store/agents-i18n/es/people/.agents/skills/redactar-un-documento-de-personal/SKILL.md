---
name: redactar-un-documento-de-personal
title: "Redactar un documento de personal"
description: "Redacto un documento de personal para ti, como una carta de oferta, un plan de onboarding, un plan de mejora de desempeño (PIP) o un guion para una conversación de retención. Redacto según tus bandas salariales, tu voz, tu marco de niveles y tus límites innegociables, para que suene como si lo hubieras escrito tú. Son solo borradores, tú envías cada uno."
version: 1
category: Personal
featured: yes
image: busts-in-silhouette
integrations: [googledocs, notion, loops, gmail, slack]
---


# Redactar un Documento de Personal

Una sola habilidad para todo primer borrador de documento de
personal que el fundador necesite. El parámetro `type` elige la
plantilla, la estructura y las validaciones. La disciplina de "solo
borradores, nunca enviados / programados / entregados" se comparte
entre todos.

## Parámetro: `type`

- `offer-letter`: carta de oferta para una nueva contratación en un
  nivel específico, anclada en las bandas salariales y la postura de
  equity.
- `onboarding-plan`: plan de Día 0, Semana 1, 30-60-90 más un mensaje
  de bienvenida de Slack y un correo de bienvenida en tu voz.
- `pip`: plan de mejora de desempeño. Verificación de escalamiento
  obligatoria primero. Si se activa un disparador de clase protegida
  más un tiempo sospechoso, DETENGO y escribo una nota de
  escalamiento en su lugar.
- `stay-conversation`: GUION verbal para una 1:1, no un correo.
  Cinco secciones: Abrir → Escuchar → Mostrar → Preguntar →
  Proponer. Filtrado contra los límites innegociables.

El usuario nombra el tipo en lenguaje sencillo ("redacta una oferta
para {candidate}", "planea el onboarding de {new hire}", "redacta un
PIP para {employee}", "escribe el guion para la conversación de
retención") → lo infiero. Si es ambiguo, hago UNA pregunta nombrando
las cuatro opciones.

## Cuándo usarla

- `type=offer-letter`: "redacta una oferta para {candidate}",
  "escribe la carta de oferta", "carta de oferta para {candidate} en
  {level}". Requisito previo: existen el registro del candidato y el
  resumen, y el fundador decidió avanzar.
- `type=onboarding-plan`: "redacta el plan de onboarding para {new
  hire}", "primeros 90 días para {new hire}", "{new hire} empieza
  {date}, prepáralo", "lista de la primera mañana para {new hire}",
  "Slack de bienvenida del Día 0 para {new hire}". Implícito:
  enrutado después de `redactar-un-documento-de-personal
  type=offer-letter` cuando se acepta la oferta.
- `type=pip`: "redacta un PIP para {employee}", "plan de mejora de
  desempeño para {employee}", "{manager} marcó a {employee} por
  preocupaciones de desempeño". Siempre lo activas tú, nunca de
  forma implícita.
- `type=stay-conversation`: "redacta una conversación de retención
  para {employee}", "{employee} podría irse", "alguien marcó ROJO,
  ¿qué digo?", "preparación para conversación de retención".

## Conexiones que necesito

Realizo el trabajo externo a través de Composio. Antes de correr esta
habilidad, verifico que las categorías de abajo estén conectadas. Si
falta alguna, nombro la categoría, te pido que la conectes desde la
pestaña de Integraciones, y me detengo.

- **Documentos (Google Docs, Notion)**: escribir la carta de oferta
  o el plan de onboarding donde quieras enviarlos. Opcional.
  (`offer-letter`, `onboarding-plan`)
- **Bandeja de entrada (Gmail, Outlook, Loops)**: tomar muestra de tu
  voz pasada para ofertas, desempeño o noticias difíciles si aún no
  lo he hecho. Opcional, para todos los tipos. La coincidencia de
  voz es más precisa con una conectada.
- **Chat (Slack)**: redactar el Slack de bienvenida en el tono
  correcto del canal; leer hilos recientes de 1:1 si guardas notas
  ahí. Opcional. (`onboarding-plan`, `pip`, `stay-conversation`)
- **Plataforma de RR. HH. (Gusto, Deel, Rippling, Justworks)**: obtener
  fecha de inicio, puesto, manager, ubicación para `onboarding-plan`;
  confirmar puesto, nivel, antigüedad y manager para `pip` /
  `stay-conversation`. Opcional.

Esta habilidad nunca envía, programa ni entrega nada, así que
ninguna integración es estrictamente obligatoria.

## Información que necesito

Primero leo tu contexto de personal. Por cada campo obligatorio que
falte, hago UNA pregunta en lenguaje sencillo (mejor modalidad: app
conectada > archivo > URL > texto pegado) y espero.

**Para todos los tipos:**

- **Contexto de personal**: Obligatorio. Por qué lo necesito: niveles, voz, límites innegociables, reglas de escalamiento. Si falta, te digo que corras primero la habilidad configurar-mi-informacion-de-personal.
- **Muestras de voz**: Opcional para `offer-letter` / `onboarding-plan`, Obligatoria para `pip` / `stay-conversation`. Por qué las necesito: los borradores sensibles al tono, en el registro equivocado, caen más duros o más suaves de lo que quieres decir. Si faltan, pregunto: "Conecta tu bandeja de entrada para que pueda tomar muestra de dos o tres mensajes pasados, o pega uno."

**`type=offer-letter`:**

- **Registro del candidato y resumen**: Obligatorio. Por qué los necesito: redacto según los antecedentes y la decisión de contratación. Si faltan, pregunto: "No tengo un resumen registrado para este candidato. ¿Ya decidieron hacer la oferta?"
- **Bandas salariales**: Obligatorias. Por qué las necesito: cada cifra debe rastrearse a una banda o a una excepción por escrito. Si faltan, pregunto: "¿Cuál es la banda salarial para este nivel, rango base más rango de equity, y algún ajuste por ubicación?"
- **Postura de equity**: Obligatoria. Por qué la necesito: el vesting, el cliff y el tipo de otorgamiento no se pueden adivinar. Si falta, pregunto: "¿Cuál es nuestro otorgamiento de equity estándar, tipo, calendario de vesting y cliff?"
- **Términos de la oferta**: Obligatorios. Por qué los necesito: fijan la oferta específica. Si faltan, pregunto: "Confirma el nivel, el base, el equity, la fecha de inicio y la ubicación para esta oferta."

**`type=onboarding-plan`:**

- **Datos centrales de la nueva contratación**: Obligatorios. Por qué los necesito: cada sección del plan depende de ellos. Si faltan, pregunto: "Dime su nombre, puesto, nivel, manager, fecha de inicio, y si es remoto o presencial."
- **Marco de niveles**: Obligatorio. Por qué lo necesito: los hitos de 30 / 60 / 90 se ajustan al estándar de ese nivel. Si falta, pregunto: "¿Cómo describirías qué significa 'cumplir el estándar' en este nivel durante los primeros 90 días?"
- **Canal de bienvenida**: Opcional. Por defecto: canal general del equipo y pendiente.
- **Asignación de compañero guía**: Opcional. Por defecto: pendiente.

**`type=pip`:**

- **Identidad del empleado**: Obligatoria. Por qué la necesito: no redacto un PIP para alguien que no puedo identificar con precisión. Si falta, pregunto: "¿Qué empleado, nombre completo, puesto, y cuánto tiempo lleva aquí?"
- **Marco de niveles y límites innegociables**: Obligatorios. Por qué los necesito: las expectativas del PIP se ajustan a tu estándar y tus límites. Si faltan, pregunto: "¿Cómo describirías el estándar en este nivel, y qué opciones están fuera de la mesa?"
- **Reglas de escalamiento**: Obligatorias. Por qué las necesito: hago una verificación de clase protegida y de tiempo sospechoso antes de cualquier borrador. Si faltan, pregunto: "¿A quién se enrutan las preocupaciones de discriminación, acoso y represalias? ¿Hay un abogado designado, o lo marcamos como pendiente hasta que tengas uno?"
- **Preocupaciones recientes y cronología**: Obligatorias. Por qué las necesito: la ventana de tiempo es determinante para la verificación de escalamiento. Si faltan, pregunto: "¿Cuándo surgieron por primera vez las preocupaciones de desempeño, y el empleado hizo alguna solicitud protegida como licencia, ajuste razonable, queja, o comunicó un embarazo en los últimos 90 días?"

**`type=stay-conversation`:**

- **Identidad del empleado**: Obligatoria. Si falta, pregunto: "¿Qué empleado, nombre completo, puesto, y cuánto tiempo lleva aquí?"

## Pasos

1. **Leer el documento de contexto de personal** en
   `context/people-context.md`. Si falta o está vacío: "Primero
   necesito tu contexto de personal, corre la habilidad
   configurar-mi-informacion-de-personal." Me detengo. Obtengo el
   marco de niveles, las bandas salariales, la postura de equity,
   las notas de voz, los límites innegociables y las reglas de
   escalamiento. Determinante para todos los tipos.
2. **Leer el registro** y llenar los vacíos con UNA pregunta puntual
   por cada campo obligatorio faltante según la sección de
   Información de arriba para ese tipo.
3. **Leer la configuración**: `config/voice.md` para el tono de
   contratación o desempeño (saludo/cierre, longitud de frases). Si
   falta, hago UNA pregunta puntual nombrando la mejor modalidad
   ("Conecta tu bandeja de entrada vía Composio para que pueda
   tomar muestra de 2 a 3 ofertas o mensajes difíciles pasados, o
   pega uno"). Escribo voice.md y continúo.
4. **Ramificar según `type`.**

   - **Si `type = offer-letter`:**
     1. **Leer el contexto del candidato.** Abro
        `interview-loops/{candidate-slug}.md` para el resumen y la
        señal de nivel/alcance acordados. Abro
        `candidates/{candidate-slug}.md` para los antecedentes. Si
        ninguno existe, le digo al usuario que corra primero
        `resumir-un-proceso-de-entrevistas`. Me detengo.
     2. **Confirmar los términos de la oferta con el fundador.** UNA
        pregunta si falta algo: "Confirma: nivel: {X}, base: {Y},
        equity: {Z}, fecha de inicio: {D}, ubicación: {L}. ¿Quieres
        cambiar alguno? (Nota: {Y} y {Z} vienen de la banda salarial
        {band-name} en el contexto de personal.)" Si el fundador se
        sale de la banda, exijo una razón explícita por escrito. La
        registro al pie de la carta de oferta.
     3. **Redactar la carta de oferta.** Estructura:
        - Saludo (según la voz de `config/voice.md` y las notas de
          voz del contexto de personal).
        - Puesto, título, nivel, línea de reporte.
        - Compensación base (de la banda salarial).
        - Equity: tamaño del otorgamiento, calendario de vesting,
          cliff, tipo (ISO/NSO/RSU si está indicado en la postura de
          equity).
        - Fecha de inicio y ubicación/designación remota.
        - Referencia a beneficios ("según nuestro canon de políticas
          de beneficios en el contexto de personal").
        - Condiciones (verificación de antecedentes, verificación de
          referencias, autorización para trabajar, PIIA/acuerdo de
          propiedad intelectual firmado).
        - Fecha límite para aceptar.
        - Firma (según tu voz).
     4. **Revisar el tono.** Releo el borrador contra las notas de
        voz. Si el tono se aleja (demasiado corporativo, demasiado
        casual, cierre equivocado), lo corrijo antes de escribir.
     5. **Escribir en `offers/{candidate-slug}.md`** de forma
        atómica (`*.tmp` → renombrar). Encabezo el archivo con un
        bloque de metadatos: `{ level, base, equity, start,
        location, band, overrideReason? }` más el cuerpo completo de
        la carta.

   - **Si `type = onboarding-plan`:**
     1. **Leer el contexto de la plataforma de RR. HH.** si está
        conectada (solo lectura, el agente nunca modifica registros
        de RR. HH.). Obtengo fecha de inicio, puesto, manager,
        ubicación, remoto/presencial. Si faltan datos centrales de
        la contratación, hago UNA pregunta puntual que cubra todos
        los vacíos (mejor modalidad: registro de la plataforma de
        RR. HH. > carta de oferta pegada > texto pegado).
     2. **Descubrir herramientas vía Composio** según se necesite:
        `composio search hris`, `composio search chat`, `composio
        search inbox`, `composio search calendar`. Si falta una
        categoría, digo cuál conectar desde Integraciones y
        continúo con el resto.
     3. **Componer el plan** con estas secciones:
        - **Preparación del Día 0**: cuentas por aprovisionar
          (correo, Slack, herramientas según el puesto), equipo por
          enviar y rastrear, asignación de compañero guía, bloques
          de calendario para la Semana 1, cola de mensajes de
          bienvenida.
        - **Semana 1**: contenido del paquete de bienvenida,
          reuniones introductorias (fundador, equipo,
          interfuncionales), recorrido por las herramientas,
          documentos de lectura, primeras tareas de acompañamiento.
        - **Hitos del Día 30**: entregables y preguntas de
          seguimiento tomadas de las expectativas del marco de
          niveles para ese nivel/área.
        - **Hitos del Día 60**: entregables ampliados y primera
          responsabilidad en solitario.
        - **Hitos del Día 90**: responsabilidad completa y primer
          punto de anclaje para la evaluación.
     4. **Redactar el mensaje de bienvenida de Slack y el correo de
        bienvenida.** Leo las notas de voz de
        `context/people-context.md` (y `config/voice.md` si existe).
        Igualo la huella de tono. Incluyo presentación del compañero
        guía, enlace al calendario del Día 1, y una línea sobre "lo
        que importa en tu primera semana".
     5. **Escribir** el plan de forma atómica en
        `onboarding-plans/{new-hire-slug}.md` (`*.tmp` →
        renombrar). Incluyo el Slack y el correo de bienvenida al
        final, en secciones claramente etiquetadas, para que el
        fundador pueda copiarlos tal cual.

   - **Si `type = pip`: primero correr la verificación de
     escalamiento:**
     1. Leo la sección de reglas de escalamiento de
        `context/people-context.md`. Anoto cada disparador listado.
        Conjunto canónico: clase protegida (raza, género, edad 40+,
        embarazo, discapacidad, religión, origen nacional,
        orientación sexual, condición de veterano, confirma la
        lista de tu jurisdicción en el documento de contexto);
        actividad protegida dentro de la ventana de riesgo
        (solicitud de licencia médica, comunicación de embarazo,
        solicitud de ajuste razonable, denuncia de buena fe o de
        alertador, actividad sindical, reclamo de compensación
        laboral); disparador de tiempo (preocupaciones que surgen o
        escalan dentro de 30 a 90 días de la actividad protegida,
        ventana definida en el documento).
     2. Evalúo: te pregunto directamente (o leo el expediente si
        existe) sobre la condición de clase protegida del empleado,
        actividad protegida reciente, y la cronología de cuándo se
        documentaron las preocupaciones frente a cuándo ocurrió la
        actividad. NO adivino, si no lo sé, pregunto y explico:
        "Necesito esto para correr la verificación de escalamiento,
        no se redacta nada hasta que se resuelva."
     3. Si CUALQUIER disparador coincide: ME DETENGO. NO redacto el
        PIP. Escribo una **nota de escalamiento** (no un PIP) en
        `performance-docs/pip-{employee-slug}.md`: "Este caso
        necesita un abogado humano antes de escribir cualquier PIP
        porque: {specific trigger}. La coincidencia: {class/activity}
        más {timing}." Agrego un párrafo corto sobre por qué (las
        demandas de represalia dependen del tiempo sospechoso; un
        PIP justo en esta ventana igual genera riesgo). Se agrega a
        `outputs.json` con `type: "performance-doc"`, `escalation:
        "needs-lawyer"`. Resumen: "Se activó el escalamiento, me
        detuve. No redactes ni entregues un PIP hasta que un abogado
        lo revise. Disparador específico: {trigger}." Me detengo.
     4. Leo los seguimientos recientes. Los últimos 4 a 6 archivos
        `checkins/{YYYY-MM-DD}.md`, extraigo cada respuesta de este
        empleado (bloqueos, frustraciones, temas). Leo
        opcionalmente `employee-dossiers/{employee-slug}.md` para
        antigüedad, historial de puesto, notas de desempeño
        recientes, comentarios previos del manager. Si falta,
        anoto el vacío y trabajo con `checkins/` y tus
        preocupaciones declaradas.
     5. Si está claro, redacto el PIP con esta estructura:
        - **Contexto**: en qué específicamente está bajo desempeño,
          con ejemplos concretos, fechados y con fuente. Primero la
          evidencia. Nunca inventar, si un ejemplo no tiene fuente,
          se deja fuera.
        - **Expectativas**: qué se ve como "cumplir el estándar" en
          este nivel, tomado del marco de niveles. Cada expectativa
          es observable y medible.
        - **Hitos**: puntos de control a 30 / 60 / 90 días. Cada
          uno nombra criterios medibles que el empleado debe
          demostrar para esa fecha. Ligados a las expectativas, no
          a impresiones.
        - **Apoyo**: qué proveen tú y el manager: 1:1 semanales,
          ritmo de retroalimentación, presupuesto de capacitación,
          acompañamiento con alguien senior, alcance de proyecto más
          claro. Un PIP sin apoyo real es solo papel.
        - **Consecuencias**: qué pasa si no se cumplen los hitos a
          30 / 60 / 90. Dicho claramente en tu voz, ni suavizado ni
          amenazante.
     6. **Escribir en `performance-docs/pip-{employee-slug}.md`** de
        forma atómica (`*.tmp` → renombrar).

   - **Si `type = stay-conversation`:**
     1. **Leer el razonamiento del puntaje de retención.** Si
        `analyses/retention-risk-{...}.md` marcó a este empleado en
        ROJO, leo el bloque de razonamiento. El guion muestra los
        temas que revelan las señales, nunca las señales de forma
        literal (los empleados no necesitan oír "tu ritmo de commits
        bajó"; necesitan oír "he sentido que algo anda distinto").
     2. Leo los seguimientos recientes. Los últimos 4 a 6 archivos
        `checkins/{YYYY-MM-DD}.md`. Leo opcionalmente
        `employee-dossiers/{employee-slug}.md` para antigüedad e
        historial de puesto.
     3. **Redactar el guion** en cinco secciones:
        - **Abrir**: cálido, específico, en tu voz. Una o dos
          frases que planteen el propósito sin emboscar.
        - **Escuchar**: 3 a 4 preguntas abiertas diseñadas para que
          hablen primero. Qué va bien. Qué frustra. Qué cambiarían.
        - **Mostrar**: qué notaste, planteado como observación, no
          como acusación. Tomado de los temas de los seguimientos y
          el historial del expediente. Nunca citar las señales de
          compromiso de forma literal.
        - **Preguntar**: pregunta directa: "¿Qué te haría querer
          quedarte aquí otro año?" (o su equivalente en tu voz). Una
          sola petición clara.
        - **Proponer**: palancas concretas: cambio de alcance,
          cambio de título, cambio de proyecto, cambio de manager,
          revisión de compensación. Filtro cada palanca contra los
          límites innegociables en `context/people-context.md`, si
          está escrito "nunca hacemos contraoferta ante una
          renuncia", la compensación queda fuera; redirijo a
          alcance, título o proyecto.
     4. Encabezado al inicio del archivo: "**Este es un guion para
        una 1:1 verbal, no un correo. No enviar.**"
     5. **Escribir en
        `performance-docs/stay-conversation-{employee-slug}.md`** de
        forma atómica (`*.tmp` → renombrar).

5. **Agregar a `outputs.json`** de forma atómica (leer, fusionar,
   escribir):
   ```json
   {
     "id": "<uuid v4>",
     "type": "<offer | onboarding-plan | performance-doc>",
     "title": "<plain title>",
     "summary": "<2-3 frases>",
     "path": "<path>",
     "status": "draft",
     "escalation": "drafted | blocked-on-escalation | needs-lawyer | n/a",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>",
     "domain": "<hiring | onboarding | performance>"
   }
   ```
   - `offer-letter` → `type: "offer"`, `domain: "hiring"`,
     `escalation: "n/a"`.
   - `onboarding-plan` → `type: "onboarding-plan"`, `domain:
     "onboarding"`, `escalation: "n/a"`.
   - `pip` → `type: "performance-doc"`, `domain: "performance"`,
     `escalation` según se clasifique (`drafted` cuando está claro,
     `needs-lawyer` cuando se activa).
   - `stay-conversation` → `type: "performance-doc"`, `domain:
     "performance"`, `escalation: "n/a"`.
   - El estado se queda en `draft`, esta habilidad nunca lo cambia a
     `ready`.

6. **Resumir para el usuario.** Un párrafo corto en lenguaje
   sencillo: qué redacté, elementos clave, y el siguiente paso.
   Nunca menciono nombres de archivo ni rutas.
   - `offer-letter`: nombre, nivel, base, equity, inicio. Cierre:
     "Esto es un borrador. Yo no envío ofertas. Revísala, edítala y
     envíala desde tu bandeja de entrada."
   - `onboarding-plan`: fecha de inicio, largo de la lista del Día
     0, mensajes de bienvenida redactados pero no enviados. "Tú los
     envías en la fecha de inicio."
   - `pip` (claro): resumen del contexto, vista rápida de 30/60/90,
     clasificación de escalamiento. Cierre: "Esto es un borrador.
     Los PIP nunca se entregan sin tu aprobación y, de preferencia,
     una segunda mirada. Léelo, dime qué cambiar, y márcalo como
     listo después de tu aprobación."
   - `pip` (escalado): "Se activó el escalamiento, me detuve. No
     redactes ni entregues un PIP hasta que un abogado lo revise.
     Disparador específico: {trigger}."
   - `stay-conversation`: "Esto es una guía para una 1:1 verbal, no
     la envíes. Léela antes de tu próxima 1:1 y adáptala en el
     momento."

## Lo que nunca hago

- Enviar, programar, publicar, o entregar ningún borrador. El
  fundador entrega, envía, o tiene la conversación. Cada artefacto
  abre con un sello claro de "BORRADOR, NO PARA ENTREGA", o "Este es
  un guion para una 1:1 verbal, no un correo" para las conversaciones
  de retención.
- Redactar un PIP sin correr primero la verificación de
  escalamiento. Sin excepciones.
- Escribir una conversación de retención como correo. Es verbal por
  diseño. Rechazo y explico si me piden una versión por correo.
- Recomendar una contraoferta a menos que
  `context/people-context.md` lo permita explícitamente.
- Inventar cifras de compensación, términos de equity, expectativas
  de nivel, ejemplos, fechas, o citas. Si falta la fuente, marco
  DESCONOCIDO y pregunto. La evidencia inventada destruye la
  legitimidad legal y humana de los PIP.
- Prometer beneficios que no están en el canon de políticas.
- Confirmar una fecha de inicio sin la aprobación del fundador.
- Modificar registros de la plataforma de RR. HH. / ATS / nómina,
  solo lectura en cada sistema de registro.
- Cambiar automáticamente cualquier borrador a `ready`, tú das la
  aprobación.

## Salidas

- `offers/{candidate-slug}.md` (`type=offer-letter`).
- `onboarding-plans/{new-hire-slug}.md` (`type=onboarding-plan`).
- `performance-docs/pip-{employee-slug}.md` (`type=pip`).
- `performance-docs/stay-conversation-{employee-slug}.md`
  (`type=stay-conversation`).
- Se agrega a `outputs.json` con el tipo, dominio y clasificación de
  escalamiento correspondientes a cada tipo.
