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
        "El 10% de lo que acordemos pagar a la empresa",
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
        line: "Comparte la empresa y algunos datos sobre ella, en más o menos un minuto.",
      },
      {
        title: "Nosotros hacemos el trabajo",
        line: "Evaluamos sus datos, acordamos una licencia y nos encargamos de la exportación.",
      },
      {
        title: "Recibes tu pago",
        line: "Hasta {amount} por empresa, tras su primera entrega.",
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
    lead: "Comparte la empresa y algunos datos. Nosotros nos encargamos del acercamiento.",
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
        label: "Recompensa confirmada",
        line: "Tu recompensa está confirmada y en camino.",
      },
      {
        label: "Recompensa pagada",
        line: "Tu recompensa ya fue pagada.",
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
    sizePlaceholder: "Unos 120",
    years: "Años en operación",
    yearsPlaceholder: "12",
    listing: "Solicitud",
    listingNone: "No está en la lista",
    optional: "Opcional",
    consent:
      "Nosotros contactamos a la empresa y te mantenemos al tanto a medida que avanza.",
    submit: "Enviar recomendación",
    privacy: "Cómo tratamos estos datos.",
    sending: "Enviando…",
    saved: {
      title: "Recibimos tu recomendación.",
      line: "La revisamos y te escribimos a medida que avanza, desde la revisión hasta el pago.",
    },
    errors: {
      send: "No pudimos enviar tu recomendación. Revisa tu conexión e inténtalo de nuevo.",
      size: "Dinos más o menos cuántas personas trabajan ahí.",
      years: "Escribe los años en operación como un número entero, como 12.",
      yourName: "Tu nombre es obligatorio.",
      yourEmail: "Escribe un correo válido.",
      companyName: "El nombre de la empresa es obligatorio.",
      website: "Escribe un sitio web válido, como acme.com.",
      sameCompany:
        "No puedes recomendar tu propia empresa. Puede sumarse como socio de datos directamente.",
    },
    again: "Recomendar otra empresa",
  },
  terms: {
    title: "Las condiciones que definen lo que ganas.",
    groups: [
      {
        title: "Cómo se te paga",
        lines: [
          "Recibes el 10% del monto que acordemos pagar a la empresa por sus datos, sin importar su tamaño, hasta {amount} en las solicitudes abiertas de hoy. La empresa necesita al menos 20 empleados de tiempo completo para calificar.",
          "Cada solicitud muestra lo máximo que puedes ganar con ella: el 10% de lo máximo que esa solicitud paga a la empresa.",
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
          "Nosotros contactamos a la empresa para presentarle Houston.",
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
        a: "Recibes el 10% del monto que acordemos pagar a la empresa por sus datos, sin importar su tamaño, hasta {amount} en las solicitudes abiertas de hoy. La empresa necesita al menos 20 empleados de tiempo completo para calificar.",
      },
      {
        q: "¿Cuándo me pagan?",
        a: "Cuando la empresa firma su licencia de datos confirmamos tu recompensa, y la pagamos tras su primera entrega.",
      },
      {
        q: "¿Cómo se define el monto de cada solicitud?",
        a: "Cada solicitud muestra el 10% de lo máximo que paga a la empresa, así ves lo máximo que puedes ganar. Lo que recibes es el 10% del monto que realmente acordemos con la empresa.",
      },
      {
        q: "¿Necesito conocer a alguien allí?",
        a: "Ayuda, pero no es necesario. Dinos qué empresa es y nosotros la contactamos.",
      },
      {
        q: "¿Qué pasa después de recomendar?",
        a: "Revisamos la empresa y la contactamos. Te escribimos a medida que avanza: enviada, en curso, recompensa confirmada, pagada.",
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
