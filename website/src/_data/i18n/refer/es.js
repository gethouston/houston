// Copia en español para /data-partners/refer. Espejo exacto de en.js
// (scripts/check-locales.mjs lo verifica). Español neutro de LatAm, de tú.

export default {
  meta: {
    title:
      "Recomienda una empresa a Houston Data Partners y gana hasta {amount}",
    description:
      "¿Conoces una empresa con datos de negocio reales? Preséntala a Houston. Cuando licencie sus datos, ganas hasta {amount}, que se pagan tras su primera entrega.",
  },
  nav: {
    how: "Cómo funciona",
    companies: "Solicitudes",
    terms: "Condiciones",
    faq: "Preguntas",
    cta: "Recomendar una empresa",
  },
  hero: {
    h1Lines: ["¿Conoces una empresa?", "Gana por presentarla."],
    sub: "Presenta una empresa que tenga datos de negocio reales. Cuando licencie esos datos con Houston, ganas hasta {amount}.",
    ctaRefer: "Recomendar una empresa",
    ctaHow: "Cómo funcionan las recomendaciones",
    card: {
      label: "Ganas hasta",
      per: "por empresa",
      terms: [
        "Monto completo para empresas de 30 o más empleados",
        "Bonos incluidos, fijados al momento de recomendar",
        "Se confirma cuando la empresa firma su licencia de datos",
        "Se paga tras su primera entrega",
      ],
    },
  },
  how: {
    title: "De la presentación al pago, en cuatro pasos.",
    lead: "Tú haces la presentación. Nosotros hacemos todo lo demás.",
    steps: [
      {
        title: "Encuentra una empresa",
        line: "Elige una solicitud abierta y piensa en una empresa que encaje.",
      },
      {
        title: "Recomiéndala",
        line: "Comparte la empresa y un contacto allí, en unos dos minutos.",
      },
      {
        title: "Nosotros hacemos el trabajo",
        line: "Evaluamos sus datos, acordamos una licencia y nos encargamos de la exportación.",
      },
      {
        title: "Recibes tu pago",
        line: "Hasta {amount} por empresa, con bonos incluidos, tras su primera entrega.",
      },
    ],
  },
  companies: {
    title: "Solicitudes abiertas de laboratorios de IA.",
    lead: "Elige un sector y abre una solicitud para ver exactamente qué busca el comprador y cuánto ganas.",
    categories: [
      "Software",
      "Salud",
      "Ciencia e I+D",
      "Industria",
      "Finanzas",
      "Servicios profesionales",
      "Medios y videojuegos",
      "Empresas en operación",
    ],
    notListed:
      "¿Conoces una empresa que no está en esta lista? Igual puedes recomendarla y ganar cuando licencie sus datos.",
    cta: "Recomendar una empresa",
  },
  refer: {
    title: "Recomienda una empresa.",
    lead: "Comparte la empresa y un contacto allí. Nosotros nos encargamos del acercamiento.",
  },
  track: {
    title: "Después de recomendar",
    note: "Te escribimos por correo a medida que avanza tu recomendación, de la revisión al pago.",
    states: [
      {
        label: "Enviada",
        line: "Recibimos tu recomendación y la estamos revisando.",
      },
      {
        label: "En curso",
        line: "Estamos trabajando con ellos. Te contaremos cómo resulta.",
      },
      {
        label: "Bono confirmado",
        line: "Tu bono está confirmado y en camino.",
      },
      {
        label: "Bono pagado",
        line: "Tu bono ya fue pagado.",
      },
    ],
  },
  form: {
    you: "Sobre ti",
    yourName: "Tu nombre",
    yourEmail: "Tu correo",
    company: "La empresa",
    companyName: "Nombre de la empresa",
    website: "Sitio web de la empresa",
    websitePlaceholder: "acme.com",
    size: "Número de empleados",
    sizeChoose: "Elige un tamaño",
    sizes: [
      "1 a 19",
      "20 a 49",
      "50 a 199",
      "200 a 499",
      "500 a 999",
      "1.000 a 4.999",
      "5.000+",
    ],
    listing: "Solicitud",
    listingNone: "No está en la lista",
    contact: "Tu contacto allí",
    contactHint:
      "Le enviamos la presentación por correo, así que necesitamos un nombre y una dirección.",
    contactName: "Nombre del contacto",
    contactEmail: "Correo del contacto",
    contactLinkedin: "LinkedIn del contacto",
    linkedinPlaceholder: "linkedin.com/in/nombre",
    fit: "¿Por qué son una buena opción?",
    fitPlaceholder: "Cómo los conoces, qué tipo de datos tienen",
    optional: "Opcional",
    consent:
      "Podemos contactar a la persona que nombres para presentarle Houston. Recomienda solo a personas que lo agradecerían.",
    submit: "Enviar recomendación",
    errors: {
      yourName: "Tu nombre es obligatorio.",
      yourEmail: "Escribe un correo válido.",
      companyName: "El nombre de la empresa es obligatorio.",
      website: "Escribe un sitio web válido, como acme.com.",
      size: "Elige el tamaño de la empresa.",
      contactName: "El nombre del contacto es obligatorio.",
      contactEmail: "Escribe un correo válido.",
      contactLinkedin: "Escribe un enlace válido, como linkedin.com/in/nombre.",
      sameCompany:
        "No puedes recomendar tu propia empresa. Puede sumarse como socio de datos directamente.",
    },
    mail: {
      subject: "Recomendación: {company}",
      referrer: "Recomendada por",
    },
    done: {
      title: "Tu recomendación está lista para enviar.",
      line: "Abrimos tu app de correo con todo completado. Envíalo y nosotros seguimos desde ahí.",
      fallback: "¿No se abrió nada? Envía los datos a {inbox}.",
      again: "Recomendar otra empresa",
    },
  },
  terms: {
    title: "Las condiciones que definen lo que ganas.",
    groups: [
      {
        title: "Cómo se te paga",
        lines: [
          "Hasta {amount} por empresa. La empresa necesita al menos 20 empleados de tiempo completo para calificar. Desde 30 empleados recibes el monto completo, y de 20 a 29 una parte proporcional a su tamaño.",
          "Los bonos adicionales se fijan cuando recomiendas y no cambian después. Un bono con fecha de cierre debe recomendarse antes de que termine.",
          "Confirmamos el monto cuando la empresa firma su licencia de datos. Hasta entonces no se debe nada.",
          "Se paga tras la primera entrega de la empresa.",
        ],
      },
      {
        title: "Quién puede recomendar",
        lines: [
          "Cualquier persona, excepto laboratorios de IA.",
          "No puedes recomendar tu propia empresa. Si es tuya, puede sumarse como socio de datos directamente.",
          "Cuenta la primera recomendación válida de cada empresa. Una empresa ya recomendada, o que ya trabaja con Houston, no califica.",
          "Puedes tener hasta cinco recomendaciones abiertas a la vez.",
        ],
      },
      {
        title: "Bueno saber",
        lines: [
          "Podemos contactar a la persona que nombres para presentarle Houston. Recomienda solo a personas que lo agradecerían.",
          "Houston decide si una empresa encaja y puede rechazar cualquier recomendación.",
        ],
      },
    ],
  },
  faq: {
    title: "Preguntas frecuentes.",
    items: [
      {
        q: "¿Cuánto puedo ganar?",
        a: "Hasta {amount} por empresa. La empresa necesita al menos 20 empleados de tiempo completo para calificar. Desde 30 empleados recibes el monto completo, y de 20 a 29 una parte proporcional a su tamaño. Algunas recomendaciones suman un bono.",
      },
      {
        q: "¿Cuándo me pagan?",
        a: "Cuando la empresa firma su licencia de datos confirmamos tu bono, y lo pagamos tras su primera entrega.",
      },
      {
        q: "¿Qué es un bono?",
        a: "Algunas recomendaciones pagan un extra: un monto fijo cuando la empresa firma, o un bono por firma rápida cuando firma pocos días después de la aprobación. Los bonos que confirmamos al recomendar son los que recibes.",
      },
      {
        q: "¿Necesito conocer a alguien allí?",
        a: "Sí. Comparte un contacto que pueda hablar de los datos de la empresa, normalmente un fundador, un directivo o un líder de operaciones.",
      },
      {
        q: "¿Qué pasa después de recomendar?",
        a: "Revisamos la empresa y contactamos a tu contacto. Te escribimos a medida que avanza: enviada, en curso, bono confirmado, pagado.",
      },
      {
        q: "¿Y si alguien la recomendó antes?",
        a: "Cuenta la primera recomendación válida, así que una empresa solo puede recomendarse una vez. Una empresa que ya trabaja con Houston no califica.",
      },
      {
        q: "¿Cuántas puedo tener abiertas?",
        a: "Hasta cinco recomendaciones pendientes de revisión a la vez.",
      },
      {
        q: "¿Qué hace Houston con los datos?",
        a: "Houston licencia datos de negocio reales a laboratorios de IA, que los usan para entrenar y evaluar sistemas de IA. Confirmamos qué datos tiene una empresa, firmamos un NDA y luego acordamos una licencia de datos y un pago. Nuestro equipo se encarga de la exportación y elimina o protege la información personal según lo que exija la licencia.",
      },
    ],
  },
  contact: {
    title: "¿Conoces una empresa que encaje?",
    lead: "Recomiéndala en unos dos minutos. Nosotros nos encargamos del acercamiento, la licencia y la exportación.",
    cta: "Recomendar una empresa",
    peopleLabel: "El equipo que se encarga del acercamiento",
  },
};
