// Copia en español para la landing. El árbol de claves lo manda en.js: este
// archivo lo refleja exacto (mismas rutas, mismos largos de arreglo), y
// scripts/check-locales.mjs lo verifica.
//
// Reglas:
// - Las claves que terminan en `Html` pueden traer marcado y se renderizan con
//   `| safe`. Todo lo demás es texto plano y la plantilla lo escapa.
// - Nada de rayas largas. Usa una coma, dos puntos o un punto seguido.
// - `{price}` y `{days}` son los únicos marcadores. Las plantillas los
//   sustituyen desde _data/pricing.js, así ningún precio queda escrito a mano
//   dentro de una traducción.
// - La estructura (tonos de avatar, elencos de caras, rutas de logos, insignias)
//   vive en _data/landing.js. Los arreglos de aquí calzan por índice con los de
//   allá.
// - El subárbol `js` se serializa en la página como window.HOUSTON_I18N desde
//   _includes/landing/i18n-data.njk. Ahí solo van textos de runtime.

export default {
  meta: {
    title: "Houston: agentes de IA que sí hacen el trabajo",
    description:
      "Houston es el espacio de trabajo compartido donde las personas y los agentes de IA trabajan juntos. Agentes compartidos, un solo tablero de misiones y roles para todo tu equipo. Gratis hasta para tres personas.",
    ogTitle: "Houston: agentes de IA que sí hacen el trabajo",
    ogDescription:
      "Houston es el espacio de trabajo compartido donde las personas y los agentes de IA trabajan juntos. Agentes compartidos, un solo tablero de misiones y roles para todo tu equipo. Gratis hasta para tres personas.",
    twTitle: "Houston: agentes de IA que sí hacen el trabajo",
    twDescription:
      "Houston es el espacio de trabajo compartido donde las personas y los agentes de IA trabajan juntos. Agentes compartidos, un solo tablero de misiones y roles para todo tu equipo. Gratis hasta para tres personas.",
    jsonLdDescription:
      "App de escritorio gratuita que pone agentes de IA a hacer trabajo real por ti, con la suscripción de ChatGPT o Claude que ya tienes y más de 1.000 integraciones.",
    ogImageAlt: "Houston: agentes de IA que sí hacen el trabajo.",
  },

  nav: {
    skip: "Saltar al contenido",
    primary: "Principal",
    multiplayer: "Multijugador",
    agents: "Agentes",
    features: "Funciones",
    pricing: "Precios",
    faq: "Preguntas",
    resources: "Recursos",
    agentStore: "Tienda de agentes",
    guides: "Guías",
    vision: "Visión",
    changelog: "Novedades",
    github: "GitHub",
    githubLabel: "Houston en GitHub",
    download: "Descargar",
    menu: "Menú",
    langLabel: "Idioma",
    links: {
      guides: "/guides/es/",
    },
  },

  hero: {
    h1Html: "Una app para todos los agentes de IA de tu&nbsp;equipo",
    sub: "Houston le da a tu equipo un solo lugar para usar agentes de IA, con cualquier modelo y conectados a las herramientas que ya usan, para que cada agente y todo lo que aprende sea de la empresa y no de la cuenta de una persona.",
    ctaDownload: "Descargar la app",
    ctaSeeHow: "Ver cómo funciona",
    windowAlt:
      "Houston, la app de escritorio: el tablero de misiones compartido de un equipo, donde los agentes mueven tareas entre En curso, Necesita tu atención y Listo, con las caras de quienes están en cada misión agrupadas al lado",
    app: {
      workspace: "Acme Studio",
      nav: {
        missionControl: "Centro de misiones",
        integrations: "Integraciones",
        models: "Modelos de IA",
        usage: "Uso",
        agentStore: "Tienda de agentes",
        settings: "Configuración",
      },
      sharedAgents: "Agentes compartidos",
      search: "Buscar misiones",
      guide: "Guíame",
      newMission: "Nueva misión",
      tabs: {
        activity: "Actividad",
        routines: "Rutinas",
        integrations: "Integraciones",
        files: "Archivos",
        archived: "Archivadas",
        agentSettings: "Configuración del agente",
      },
      cols: {
        running: "En curso",
        needsYou: "Necesita tu atención",
        done: "Listo",
      },
      peopleGroup: "Personas en esta misión",
      agents: {
        houston: "Asistente personal",
        "chief-of-staff": "Jefe de Gabinete",
        bookkeeper: "Contador",
        "sales-rep": "Ejecutivo de Ventas",
      },
      boardTitle: "Asistente personal",
      needsCard: {
        title: "Aprobar la renovación del proveedor",
        desc: "Condiciones comparadas, falta tu visto bueno",
      },
      doneCard: {
        title: "Dar seguimiento al correo urgente",
        desc: "4 respuestas listas, 17 archivados",
      },
    },
  },

  multiplayer: {
    title: "La IA dejó de ser cosa de una sola persona.",
    phrase1: "La IA vive encerrada en chats privados.",
    phrase2: "Houston pone tus agentes frente a todo el equipo.",
    tabsLabel: "Casos de uso",
    tabs: ["Ventas", "Contabilidad", "Contratación", "Soporte"],
    agentName: "Ejecutivo de Ventas",
    mission: "Rehacer el reporte de pipeline del Q3",
    composer: "Escríbele a tu equipo y al agente...",
    peopleLabel: "Personas en este chat",
    msgs: [
      {
        who: "Julian",
        textHtml:
          "Rehaz el reporte de pipeline del Q3. Trae todos los negocios abiertos de HubSpot, crúzalos con los hilos de correo en Gmail y dime cuáles se van a cerrar de verdad.",
      },
      {
        who: "Ejecutivo de Ventas",
        textHtml:
          "Ya voy en eso. 63 negocios abiertos en HubSpot, cruzados con Gmail. 12 llevan más de 3 semanas sin respuesta y 5 están frenados esperando un contrato de nuestro lado.",
      },
      {
        who: "Felipe",
        textHtml:
          'Saca las cuentas que se dieron de baja y agrega las renovaciones de este trimestre. <span class="mention">@Julian</span> los frenados los decides tú.',
      },
      {
        who: "Ejecutivo de Ventas",
        textHtml:
          "Actualizado. Quité 4 cuentas dadas de baja y sumé 9 renovaciones. El pipeline ponderado es de $1.4M, con $380K en riesgo real por los hilos frenados.",
      },
      {
        who: "Julian",
        textHtml:
          "Persigue los frenados. Déjalo donde todo el equipo lo pueda ver.",
      },
      {
        who: "Ejecutivo de Ventas",
        textHtml:
          'Listo. El reporte está en el tablero compartido, los negocios en riesgo marcados y un seguimiento redactado para cada uno. <span class="mention">@Julian</span> confírmame y envío los 12.',
      },
    ],
  },

  parallel: {
    title: "Multiagente por diseño.",
    lines: [
      "Cada equipo y cada proyecto necesita agentes distintos. Houston nació multiagente desde el día cero.",
      "Y cada agente es multichat: cada tarjeta es su propia conversación. Así llevas muchos proyectos, con mucha gente, en paralelo.",
      "Crea un agente para tu negocio en minutos, o parte de uno que la comunidad ya construyó.",
    ],
    cta: "Explorar la Tienda de agentes",
    tabsLabel: "Agentes",
    peopleLabel: "Personas en esta misión",
    agents: {
      "sales-rep": {
        name: "Ejecutivo de Ventas",
        missionCount: "18 misiones",
        more: "+13 misiones más",
        alt: "La columna de misiones del Ejecutivo de Ventas: 18 misiones en paralelo, se ven las cinco primeras",
        cards: [
          {
            title: "Rehacer el reporte de pipeline del Q3",
            desc: "Cruzando 63 negocios con Gmail",
          },
          {
            title: "Preparar la renovación de Acme",
            desc: "El precio necesita tu aprobación",
          },
          {
            title: "Dar seguimiento a 12 prospectos fríos",
            desc: "3 respuestas redactadas, 2 negocios avanzando",
          },
          {
            title: "Redactar la propuesta de Meridian",
            desc: "El alcance salió de las últimas tres llamadas",
          },
          {
            title: "Registrar la semana en HubSpot",
            desc: "Cada llamada y cada respuesta, en su lugar",
          },
        ],
      },
      bookkeeper: {
        name: "Contador",
        missionCount: "14 misiones",
        more: "+9 misiones más",
        alt: "La columna de misiones del Contador: 14 misiones en paralelo, se ven las cinco primeras",
        cards: [
          {
            title: "Conciliar marzo",
            desc: "Cruzando QuickBooks con el movimiento del banco",
          },
          {
            title: "Presentar el reporte de gastos del Q1",
            desc: "Faltan 2 recibos, marcados para ti",
          },
          {
            title: "Cobrar 4 facturas vencidas",
            desc: "2 pagadas, 2 prometidas para esta semana",
          },
          {
            title: "Armar el paquete de impuestos",
            desc: "Reuniendo los estados de cuenta para el contador externo",
          },
          {
            title: "Clasificar las suscripciones nuevas",
            desc: "3 herramientas encontradas en el estado de cuenta",
          },
        ],
      },
      "hr-manager": {
        name: "Gerente de Talento",
        missionCount: "21 misiones",
        more: "+16 misiones más",
        alt: "La columna de misiones del Gerente de Talento: 21 misiones en paralelo, se ven las cinco primeras",
        cards: [
          {
            title: "Filtrar a quienes aplicaron a diseño",
            desc: "34 perfiles contra el brief del puesto",
          },
          {
            title: "Redactar la política de referidos",
            desc: "Primer borrador listo para tu revisión",
          },
          {
            title: "Dar la bienvenida a Maya",
            desc: "Cuentas creadas, documento de inducción enviado",
          },
          {
            title: "Agendar las entrevistas finales",
            desc: "5 candidatos, calendarios cuadrados",
          },
          {
            title: "Renovar el plan de salud",
            desc: "Tres cotizaciones comparadas, una marcada",
          },
        ],
      },
      "support-rep": {
        name: "Analista de Soporte",
        missionCount: "16 misiones",
        more: "+11 misiones más",
        alt: "La columna de misiones del Analista de Soporte: 16 misiones en paralelo, se ven las cinco primeras",
        cards: [
          {
            title: "Vaciar la fila del fin de semana",
            desc: "41 tickets, redactando respuestas",
          },
          {
            title: "Escalar el error de facturación",
            desc: "3 reportes coinciden, necesita a un ingeniero",
          },
          {
            title: "Enviar el resumen semanal",
            desc: "Los temas principales, resumidos para el equipo",
          },
          {
            title: "Actualizar el centro de ayuda",
            desc: "4 artículos reescritos con tickets reales",
          },
          {
            title: "Etiquetar las peticiones de funciones",
            desc: "12 guardadas para la revisión de producto",
          },
        ],
      },
    },
  },

  compound: {
    title: "Enséñale una vez. Mejor para siempre.",
    lines: [
      "Corriges al agente una vez y se le queda, para todos. Cada aprendizaje, habilidad y archivo que carga es de todo el equipo.",
      "Eso es acumular: cada semana tus agentes conocen tu negocio mejor que la anterior.",
      "Quien entra nuevo lo hereda todo desde el primer día, y nada se va por la puerta.",
    ],
    tabsLabel: "Lo que carga el agente",
    tabs: {
      learnings: "Aprendizajes",
      skills: "Habilidades",
      context: "Contexto",
    },
    agentName: "Ejecutivo de Ventas",
    agentSub: "Agente compartido · Acme Studio",
    countLabel: "aprendizajes",
    learnings: {
      alt: "Los aprendizajes del agente, enseñados por el equipo y creciendo: cuentas dadas de baja fuera del cálculo, dueños del negocio en copia, renovaciones desde la fecha del contrato, descuentos con visto bueno, llamadas registradas en HubSpot",
      rows: [
        {
          note: "Dejar fuera del pipeline las cuentas dadas de baja",
          when: "hace 2 días",
        },
        {
          note: "Poner en copia al dueño del negocio antes de enviar nada",
          when: "hace 5 días",
        },
        {
          note: "Contar las renovaciones desde la fecha del contrato",
          when: "hace 1 semana",
        },
        {
          note: "Los descuentos de más de 15% necesitan visto bueno",
          when: "hace 2 semanas",
        },
        {
          note: "Registrar cada llamada en HubSpot, el mismo día",
          when: "hace 3 semanas",
        },
      ],
    },
    skills: {
      alt: "Las habilidades del agente y las herramientas que usa cada una: reporte de pipeline con HubSpot y Gmail, secuencia de seguimiento con Gmail, borrador de propuesta con Notion, resumen de reunión con Slack y Notion, recuento de ganados y perdidos con HubSpot y Slack",
      rows: [
        { note: "Reporte de pipeline" },
        { note: "Secuencia de seguimiento" },
        { note: "Borrador de propuesta" },
        { note: "Resumen de reunión" },
        { note: "Recuento de ganados y perdidos" },
      ],
    },
    context: {
      alt: "El contexto del agente, una galería de archivos del equipo: lista de precios, notas del cliente ideal, metas del Q3, casos de éxito, manual de objeciones, guion del demo",
      tiles: [
        { name: "Lista de precios", meta: "2 páginas" },
        { name: "Notas del cliente ideal", meta: "actualizado hace 3 días" },
        { name: "Metas del Q3", meta: "en vivo" },
        { name: "Casos de éxito", meta: "carpeta" },
        { name: "Manual de objeciones", meta: "9 jugadas" },
        { name: "Guion del demo", meta: "actualizado hace 1 semana" },
      ],
    },
  },

  stack: {
    title: "Se conecta con todo lo que ya usas.",
    tiles: [
      {
        n: "1.000+",
        l: "integraciones, las herramientas en las que tu equipo ya trabaja",
        more: "+990 más",
      },
      {
        n: "400+",
        l: "modelos, cambia el de cada agente cuando quieras",
        more: "+30 proveedores más",
      },
      {
        n: "Usa tu suscripción de IA",
        l: "ChatGPT, Claude y los planes de programación que ya pagas. Sin una segunda cuenta.",
        more: "o trae cualquier API key",
      },
      {
        n: "Modelos locales",
        l: "un computador le sirve a todo el equipo, totalmente privado",
        more: "o cualquier servidor compatible con OpenAI",
      },
    ],
  },

  pricing: {
    title: "¿Listo para multiplicar por 10 a tu equipo de un día para otro?",
    lead: "Gratis para las primeras tres personas. Pasa al plan de equipo cuando todos quieran entrar.",
    free: {
      name: "Gratis",
      note: "para ti, o para un equipo de hasta tres",
      items: [
        "Tu espacio de trabajo personal, gratis para siempre",
        "Hasta tres personas cuando estés listo",
        "Las más de 1.000 integraciones",
        "Funciona con tu suscripción de IA",
        "Agentes de la comunidad, desde la tienda",
      ],
      cta: "Descargar la app",
    },
    team: {
      chip: "El más popular",
      name: "Equipo",
      per: "/persona/mes",
      note: "facturado al año · {price} facturado al mes",
      items: [
        "Todo lo del plan Gratis",
        "Compañeros ilimitados",
        "Uso ilimitado, agentes a toda hora",
        "Agentes compartidos y espacios de equipo",
        "Roles y límites",
      ],
      cta: "Empezar prueba gratis",
    },
    enterprise: {
      name: "Empresarial",
      amount: "A medida",
      note: "para equipos grandes",
      items: [
        "SSO",
        "Revisión de seguridad",
        "Puesta en marcha para todo el equipo",
      ],
      cta: "Hablemos",
    },
  },

  faq: {
    title: "Preguntas, respondidas",
    groups: [
      {
        title: "Multijugador y equipos",
        items: [
          {
            q: "¿Puede todo mi equipo trabajar sobre el mismo agente?",
            aHtml:
              "Sí. Comparte un agente y elige quién puede usarlo y quién puede administrarlo. Todos trabajan desde el mismo tablero de misiones y pueden retomar una misión donde otra persona la dejó.",
          },
          {
            q: "¿Cuáles son los roles?",
            aHtml:
              "Tres: dueño, administrador y miembro. El dueño maneja el pago y puede hacer de todo. Los administradores suman personas, crean agentes y cambian la configuración. Los miembros usan los agentes que les dan.",
          },
          {
            q: "¿Quién ve cuáles agentes?",
            aHtml:
              "Tú decides, agente por agente. Cada persona solo ve y usa los agentes que le compartes, así el resto del espacio de trabajo queda privado.",
          },
          {
            q: "¿Qué es un espacio?",
            aHtml:
              "Cada persona tiene un espacio personal que es solo suyo. Al lado están los espacios de equipo para el trabajo compartido, y cambias entre ellos con un clic.",
          },
          {
            q: "¿Puedo ponerle límites a un agente compartido?",
            aHtml:
              "Sí. Para cada agente compartido eliges qué aplicaciones y qué modelos de IA puede usar. Cada persona sigue eligiendo su propio modelo dentro de lo que tú permites.",
          },
          {
            q: "¿Compartir un agente borra su historial?",
            aHtml:
              "No. Pásalo a un equipo y conserva su historial y sus habilidades, y tus compañeros pueden retomar cualquier misión tal como está.",
          },
          {
            q: "¿Escritorio o web?",
            aHtml:
              "Los dos. Llegas a los mismos espacios, agentes y misiones desde la app de escritorio o desde la web.",
          },
        ],
      },
      {
        title: "Agentes y herramientas",
        items: [
          {
            q: "¿Qué agentes vienen incluidos?",
            aHtml:
              "Un equipo completo: asistente personal, contador, gerente de talento, analista de soporte, ejecutivo de ventas, gerente administrativo, analista financiero, líder de crecimiento y más.",
          },
          {
            q: "¿Puedo agregar o crear más?",
            aHtml:
              'Sí. Explora más de 30 en la <a href="https://agents.gethouston.ai">Tienda de agentes</a>, o crea el tuyo en minutos.',
          },
          {
            q: "¿Con qué se pueden conectar los agentes?",
            aHtml:
              "Con más de 1.000 herramientas que ya usas, como Gmail, Slack, QuickBooks, HubSpot y Google Drive.",
          },
          {
            q: "¿Puedo usar mi propio plan de ChatGPT o Claude?",
            aHtml:
              "Sí. Conecta el plan de ChatGPT o Claude que ya pagas y no hay una segunda cuenta de IA. ¿Prefieres llaves de API u otro proveedor? También funciona.",
          },
          {
            q: "¿Qué modelos pueden usar los agentes?",
            aHtml:
              "Más de 400, de todos los proveedores grandes. Cada agente puede correr un modelo distinto, cada persona elige el suyo dentro de eso, y los administradores ponen el tope para el equipo.",
          },
          {
            q: "¿Podemos correr modelos locales?",
            aHtml:
              "Sí. Corre un modelo local en un computador y le sirve tokens a los agentes de todo el equipo. Privado por defecto, y sin ninguna cuenta por token.",
          },
        ],
      },
      {
        title: "Precios y facturación",
        items: [
          {
            q: "¿Qué es gratis?",
            aHtml:
              "Houston es gratis hasta para tres personas en un espacio, con uso limitado y sin tarjeta. Alcanza de sobra para poner agentes a hacer trabajo real y sentir el valor. Cuando todo el equipo quiera entrar, o necesites uso ilimitado, pasas al plan Equipo.",
          },
          {
            q: "¿Quién paga por un equipo?",
            aHtml:
              "El dueño. Todas las personas que invitas van dentro del plan del dueño, así que los miembros nunca ponen una tarjeta propia.",
          },
          {
            q: "¿Qué cuenta como una persona?",
            aHtml:
              "Un miembro que acepta tu invitación. Las invitaciones pendientes no se cobran, y el cobro se prorratea cuando alguien entra o sale.",
          },
          {
            q: "¿Cómo funciona la prueba gratis?",
            aHtml:
              "Un espacio de equipo tiene {days} días de prueba gratis, sin tarjeta. Empieza cuando tu segunda persona acepta.",
          },
          {
            q: "¿Qué pasa cuando termina la prueba?",
            aHtml:
              "No se borra nada. El espacio vuelve al plan gratis: hasta tres personas y uso limitado. Cada agente y cada misión se quedan donde están. Agrega una tarjeta cuando quieras.",
          },
          {
            q: "¿Los miembros descargan o pagan?",
            aHtml:
              "Los miembros solo aceptan la invitación y descargan la app. El cobro se queda con el dueño.",
          },
          {
            q: "¿Agentes a toda hora y plan Empresarial?",
            aHtml:
              "El plan Equipo mantiene los agentes compartidos corriendo aunque los computadores estén cerrados. El plan Empresarial suma inicio de sesión único, SLA de disponibilidad, soporte prioritario en inglés y español, y despliegue privado.",
          },
        ],
      },
      {
        title: "Cómo conseguir la app",
        items: [
          {
            q: "¿En qué sistemas está Houston?",
            aHtml:
              'Descárgala para <button class="dl-os-link" data-dl-trigger data-dl-source="faq-os" data-dl-os="mac">macOS</button>, <button class="dl-os-link" data-dl-trigger data-dl-source="faq-os" data-dl-os="windows">Windows</button> o <button class="dl-os-link" data-dl-trigger data-dl-source="faq-os" data-dl-os="linux">Linux</button>. En Windows, elige x64 (Intel o AMD) o ARM64 (Surface, Snapdragon). En Linux, descarga el AppImage (x64).',
          },
          {
            q: "¿Cómo entro?",
            aHtml:
              "Houston es gratis mientras estamos en beta. Toca descargar, cuéntanos quién eres y el instalador arranca de inmediato.",
          },
        ],
      },
    ],
  },

  footer: {
    blurb:
      "El espacio de trabajo donde las personas y los agentes de IA trabajan juntos. Gratis para probar, y para todo el equipo cuando estés listo.",
    download: "Descargar",
    mac: "macOS",
    windows: "Windows",
    linux: "Linux",
    product: "Producto",
    company: "Empresa",
    resources: "Recursos",
    contact: "Contacto",
    twitter: "Twitter / X",
    credit: "Houston. Código abierto.",
    privacy: "Política de privacidad",
    terms: "Términos del servicio",
    unsubscribe: "Darse de baja",
    unsubscribeSubject: "Darse de baja",
    unsubscribeBody:
      "Por favor, saquen este correo de las comunicaciones de Houston.",
    langLabel: "Idioma",
  },

  gate: {
    title: "Consigue Houston",
    lead: "Cuéntanos quién eres y tu descarga arranca de inmediato.",
    close: "Cerrar",
    name: {
      label: "Nombre completo",
      placeholder: "Ana Pérez",
      error: "Escribe tu nombre completo para continuar.",
    },
    email: {
      label: "Correo",
      placeholder: "ana@empresa.com",
      error: "Escribe un correo válido para continuar.",
    },
    phone: {
      label: "Número de teléfono",
      optional: "(mejor si te encontramos por WhatsApp)",
      placeholder: "555 123 4567",
      error: "Escribe tu número de teléfono para continuar.",
      ccLabel: "Código de país",
    },
    linkedin: {
      label: "LinkedIn",
      placeholder: "https://www.linkedin.com/in/tu-perfil",
      error: "Escribe una URL de LinkedIn válida para continuar.",
    },
    country: {
      label: "País",
      placeholder: "Elige tu país",
      error: "Elige tu país para continuar.",
      searchPlaceholder: "Buscar países",
      empty: "Sin resultados",
      menuLabel: "Lista de países",
    },
    submit: "Continuar a la descarga",
    formError: "Algo salió mal. Inténtalo de nuevo.",
    fineprintHtml:
      'Al continuar aceptas recibir novedades del producto de Houston. Puedes darte de baja cuando quieras. Consulta nuestra <a href="/privacy/">Política de privacidad</a>.',
    done: {
      title: "Todo listo",
      lead: "Elige tu descarga y a volar.",
    },
    macBtn: "Descargar para Mac",
    winX64: "Windows (x64 / Intel / AMD)",
    winArm: "Windows (ARM64 / Surface, Snapdragon)",
    linuxBtn: "Linux (AppImage / x64)",
    notSure: "¿No sabes cuál elegir?",
    notSureBody:
      'La mayoría de los computadores son x64 (procesadores Intel o AMD). Solo una Surface Pro X, una Surface Pro 9 5G, un portátil con Snapdragon X u otra máquina con Windows basada en ARM necesita ARM64. En la primera instalación verás un aviso de SmartScreen: toca "Ejecutar de todas formas". Ya estamos trabajando en la firma de código completa.',
    switchArch: "¿Elegiste mal? Cambia a la otra versión →",
  },

  // Se le muestra a quien llega con el navegador en otro idioma. La copia en
  // inglés es solo el ancla de paridad: aquí invitamos en español.
  langBanner: {
    text: "Este sitio también está en español.",
    cta: "Ver en español",
    dismiss: "Seguir en inglés",
  },

  // Todo lo de abajo viaja al navegador como window.HOUSTON_I18N.
  js: {
    people: {
      julian: "Julian",
      felipe: "Felipe",
      maya: "Maya",
      ana: "Ana",
    },
    heroDemo: {
      agents: {
        houston: "Asistente personal",
        "sales-rep": "Ejecutivo de Ventas",
        bookkeeper: "Contador",
        "chief-of-staff": "Jefe de Gabinete",
      },
      scripts: {
        houston: {
          mission: "Vaciar la bandeja de entrada",
          card: {
            title: "Dar seguimiento al correo urgente",
            running: "Leyendo 23 sin leer, redactando respuestas",
            done: "4 respuestas listas, 17 archivados",
          },
          needsYou: {
            title: "Aprobar la renovación del proveedor",
            desc: "Condiciones comparadas, falta tu visto bueno",
          },
        },
        "sales-rep": {
          mission: "Rehacer el pipeline del Q3",
          card: {
            title: "Rehacer el reporte de pipeline del Q3",
            running: "Cruzando negocios de HubSpot con hilos de Gmail",
            done: "Reporte listo, 6 negocios marcados en riesgo",
          },
          needsYou: {
            title: "Aprobar la renovación de Acme",
            desc: "Borrador listo, falta tu visto bueno",
          },
        },
        bookkeeper: {
          mission: "Conciliar el mes pasado",
          card: {
            title: "Conciliar 842 movimientos",
            running: "Cruzando Stripe con el movimiento del banco",
            done: "838 cuadraron, 4 marcados para revisar",
          },
          needsYou: {
            title: "Revisar 4 cargos marcados",
            desc: "Sin factura registrada, lo decides tú",
          },
        },
        "chief-of-staff": {
          mission: "Preparar el informe del directorio",
          card: {
            title: "Preparar el informe del directorio",
            running: "Reuniendo indicadores y temas abiertos",
            done: "El resumen de una página está en tu correo",
          },
          needsYou: {
            title: "Aprobar el plan de lanzamiento",
            desc: "Cronograma armado, falta tu OK",
          },
        },
      },
    },
    chat: {
      scenarios: {
        sales: {
          label: "Ventas",
          agent: "Ejecutivo de Ventas",
          mission: "Rehacer el reporte de pipeline del Q3",
          turns: [
            "Rehaz el reporte de pipeline del Q3. Trae todos los negocios abiertos de HubSpot, crúzalos con los hilos de correo en Gmail y dime cuáles se van a cerrar de verdad.",
            "Ya voy en eso. 63 negocios abiertos en HubSpot, cruzados con Gmail. 12 llevan más de 3 semanas sin respuesta y 5 están frenados esperando un contrato de nuestro lado.",
            "Saca las cuentas que se dieron de baja y agrega las renovaciones de este trimestre. @Julian los frenados los decides tú.",
            "Actualizado. Quité 4 cuentas dadas de baja y sumé 9 renovaciones. El pipeline ponderado es de $1.4M, con $380K en riesgo real por los hilos frenados.",
            "Persigue los frenados. Déjalo donde todo el equipo lo pueda ver.",
            "Listo. El reporte está en el tablero compartido, los negocios en riesgo marcados y un seguimiento redactado para cada uno. @Julian confírmame y envío los 12.",
          ],
        },
        bookkeeping: {
          label: "Contabilidad",
          agent: "Contador",
          mission: "Cerrar los libros del mes pasado",
          turns: [
            "Cierra el mes pasado. Trae cada movimiento de Stripe y del banco, crúzalos y marca todo lo que no cuadre.",
            "Voy. 842 movimientos entre Stripe y el banco. 838 cuadraron limpio. 3 cargos del banco no tienen factura y 1 reembolso quedó registrado dos veces. @Julian ese reembolso parece tuyo, ¿me confirmas?",
            "Confirmado, lo emitimos por error. Clasifica los 3 cargos como software.",
            "Listo. Reembolso anotado, 3 cargos clasificados como software. Los libros cuadran al centavo.",
            "Excelente. Mándaselo al contador externo.",
            "Enviado. El mes conciliado ya está con el contador externo. @Felipe el resumen de una página quedó en la carpeta compartida para tu visto bueno.",
          ],
        },
        hiring: {
          label: "Contratación",
          agent: "Gerente de Talento",
          mission: "Contratar a un diseñador senior",
          turns: [
            "Abre la vacante de diseñador senior. Publícala y filtra a todos los que apliquen contra el brief.",
            "Publicada en LinkedIn y en la página de empleos. 41 personas hasta ahora, cada una calificada contra el brief. Estoy priorizando diseño de producto y experiencia B2B.",
            "Sube al tope a quien tenga experiencia en fintech. @Julian vas a querer ver a los dos primeros.",
            "Reordenado. Los 9 mejores arriba, 4 con recorrido en fintech. Te adjunté notas y portafolio de cada uno.",
            "Agenda llamadas con los 3 mejores.",
            "Agendadas. Tres llamadas de presentación en tu calendario esta semana. @Felipe ¿te sumo a las invitaciones del panel?",
          ],
        },
        support: {
          label: "Soporte",
          agent: "Analista de Soporte",
          mission: "Vaciar la fila de soporte",
          turns: [
            "La fila de soporte está desbordada, 34 tickets abiertos en dos días. Clasifícalos y resuelve lo que puedas.",
            "Estoy revisando los 34. 19 son la misma duda de facturación tras el cambio de precio, 8 son cambios de contraseña y 7 necesitan a una persona.",
            "Mándales a los 19 de facturación las nuevas preguntas frecuentes de precios, y cambia las 8 contraseñas.",
            "Listo. 27 tickets respondidos y cerrados desde la bandeja compartida. Los 7 que necesitan criterio quedaron etiquetados y en espera.",
            "¿De qué son los 7?",
            "Cinco dudas sobre funciones con respuestas redactadas, y dos reembolsos por encima de nuestro límite. @Felipe aprueba esos y todo sale hoy.",
          ],
        },
      },
    },
    compound: {
      justNow: "hace un momento",
      pool: [
        {
          note: "Cotizar el precio anual en la moneda del cliente",
          who: "Felipe",
        },
        {
          note: "Sumar a soporte cuando un negocio menciona errores",
          who: "Julian",
        },
        {
          note: "Nunca prometer una fecha sin revisar el roadmap",
          who: "Maya",
        },
        {
          note: "Resumir cada llamada de demo en las notas del negocio",
          who: "Julian",
        },
        {
          note: "Marcar a los competidores que se nombren en cualquier hilo",
          who: "Felipe",
        },
        {
          note: "Enviar los correos de resumen antes del mediodía, hora del cliente",
          who: "Ana",
        },
      ],
    },
    gate: {
      preparing: "Preparando tu descarga…",
      submit: "Continuar a la descarga",
      needOther: "¿La necesitas para otro sistema?",
      countrySearch: "Buscar países",
      countryEmpty: "Sin resultados",
      ccLabel: "Código de país",
      ccSearch: "Buscar códigos de país",
    },
  },
};
