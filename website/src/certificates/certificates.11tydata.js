/*
 * Certificate page copy, en + es, in ONE place.
 *
 * A directory data file (not a Nunjucks `{% set %}`) because the copy is needed
 * by templates that cannot share a scope: the share page renders in the
 * attendee's own language (pagination over items, lang per certificate), the
 * per-event claim pages render in the event's language, and the entry +
 * verify pages render in English. Nunjucks `include` does not export `set`
 * variables to the caller, and a macro can only return markup, so the data
 * cascade is the only seam that gives every one of them the same dictionary.
 *
 * `{event}` / `{name}` placeholders are substituted in the templates with the
 * `replace` filter, never string-concatenated, so word order stays translatable.
 */

const en = {
  // ── Claim (entry + per-event) ──
  eyebrow: "Certificates",
  title: "Get your certificate",
  lead: "Enter the email you registered with and we will pull up your certificate.",
  leadEvent:
    "Enter the email you registered with for {event} and we will pull up your certificate.",
  eventLabel: "Event",
  eventPlaceholder: "Choose your event",
  emailLabel: "Email",
  emailPlaceholder: "you@company.com",
  submit: "Find my certificate",
  submitting: "Searching",
  viewCertificate: "View your certificate",
  notFoundTitle: "We could not find that email",
  notFound:
    "That address is not on the attendee list for this event. Check it for typos, or try the one you used to register.",
  rateLimited: "Too many tries. Wait a minute and try again.",
  networkError:
    "We could not reach Houston. Check your connection and try again.",
  serverError: "Something went wrong on our side. Try again in a moment.",
  missingEmail: "Enter your email first.",
  invalidEmail:
    "That does not look like an email address. Check it and try again.",
  missingEvent: "Choose your event first.",
  noEvents:
    "No events are published yet. If you attended one, enter your email and we will look you up anyway.",
  supportLine: "Still stuck? Write to",
  verifyPrompt: "Checking someone else's certificate?",
  verifyLink: "Verify a certificate",
  // ── Claim step 2: confirm the name that goes on the certificate ──
  nameStepTitle: "You're on the list!",
  nameStepLead: "One last look at your name before we finish.",
  nameLabel: "Your name",
  nameHint: "This is exactly how your name will appear on the certificate.",
  nameContinue: "Looks good, continue",
  nameSaving: "Saving",
  nameBack: "Use a different email",
  nameRequired: "Write your name first.",
  nameTooLong: "That name is too long. Use 80 characters or fewer.",
  nameRejected:
    "We could not save that name. Use between 1 and 80 characters and try again.",
  nameGone:
    "We lost track of that certificate. Go back and search with your email again.",
  nameRateLimited: "Too many changes in a row. Wait a minute and save again.",
  nameNetwork:
    "We could not reach Houston to save your name. Check your connection and try again.",
  nameServer:
    "Something went wrong while saving your name. Try again in a moment.",
  // ── Claim, done ──
  doneTitle: "Your certificate is ready.",
  doneBody: "Issued to {name}.",
  regenerating:
    "Your certificate is being regenerated with this name, it will show up there in a few minutes.",
  shareHint:
    "The link is public: share it anywhere, and anyone can check from that page that it is real.",
  // ── Share page ──
  shareEyebrow: "Certificate of participation",
  imageAlt: "Houston certificate of participation for {name}, {event}",
  ogTitle: "{name} took part in {event}",
  ogDescription:
    "{event}, {date}. Certificate of participation issued by Houston.",
  // Used when the event carries no usable date, so the sentence never ships
  // with a hole in it.
  ogDescriptionNoDate:
    "{event}. Certificate of participation issued by Houston.",
  download: "Download",
  addToLinkedIn: "Add to your LinkedIn profile",
  shareLabel: "Share",
  copyLink: "Copy link",
  copied: "Copied",
  codeLabel: "Code",
  shareText: "I took part in {event} with Houston.",
  verifyFoot: "Anyone can check that this certificate is real at",
};

const es = {
  eyebrow: "Certificados",
  title: "Obtén tu certificado",
  lead: "Escribe el correo con el que te registraste y buscamos tu certificado.",
  leadEvent:
    "Escribe el correo con el que te registraste a {event} y buscamos tu certificado.",
  eventLabel: "Evento",
  eventPlaceholder: "Elige tu evento",
  emailLabel: "Correo",
  emailPlaceholder: "tu@empresa.com",
  submit: "Buscar mi certificado",
  submitting: "Buscando",
  viewCertificate: "Ver tu certificado",
  notFoundTitle: "No encontramos ese correo",
  notFound:
    "Ese correo no está en la lista de asistentes de este evento. Revisa que esté bien escrito o prueba con el que usaste para registrarte.",
  rateLimited: "Demasiados intentos. Espera un minuto e inténtalo de nuevo.",
  networkError:
    "No pudimos conectar con Houston. Revisa tu conexión e inténtalo de nuevo.",
  serverError: "Algo falló de nuestro lado. Inténtalo de nuevo en un momento.",
  missingEmail: "Escribe tu correo primero.",
  invalidEmail: "Eso no parece un correo. Revísalo e inténtalo de nuevo.",
  missingEvent: "Elige tu evento primero.",
  noEvents:
    "Todavía no hay eventos publicados. Si asististe a uno, escribe tu correo y te buscamos igual.",
  supportLine: "¿Sigues sin encontrarlo? Escríbenos a",
  verifyPrompt: "¿Quieres comprobar el certificado de otra persona?",
  verifyLink: "Verificar un certificado",
  nameStepTitle: "¡Estás en la lista!",
  nameStepLead: "Revisa tu nombre una última vez antes de terminar.",
  nameLabel: "Tu nombre",
  nameHint: "Así aparecerá exactamente tu nombre en el certificado.",
  nameContinue: "Está bien, continuar",
  nameSaving: "Guardando",
  nameBack: "Usar otro correo",
  nameRequired: "Escribe tu nombre primero.",
  nameTooLong: "Ese nombre es muy largo. Usa 80 caracteres o menos.",
  nameRejected:
    "No pudimos guardar ese nombre. Usa entre 1 y 80 caracteres e inténtalo de nuevo.",
  nameGone:
    "Perdimos el rastro de ese certificado. Vuelve y busca otra vez con tu correo.",
  nameRateLimited:
    "Demasiados cambios seguidos. Espera un minuto y guarda de nuevo.",
  nameNetwork:
    "No pudimos conectar con Houston para guardar tu nombre. Revisa tu conexión e inténtalo de nuevo.",
  nameServer:
    "Algo falló al guardar tu nombre. Inténtalo de nuevo en un momento.",
  doneTitle: "Tu certificado está listo.",
  doneBody: "Emitido a nombre de {name}.",
  regenerating:
    "Estamos regenerando tu certificado con este nombre, aparecerá ahí en unos minutos.",
  shareHint:
    "El enlace es público: compártelo donde quieras y cualquiera puede comprobar en esa página que es real.",
  shareEyebrow: "Certificado de participación",
  imageAlt: "Certificado de participación de Houston de {name}, {event}",
  ogTitle: "{name} participó en {event}",
  ogDescription:
    "{event}, {date}. Certificado de participación emitido por Houston.",
  ogDescriptionNoDate:
    "{event}. Certificado de participación emitido por Houston.",
  download: "Descargar",
  addToLinkedIn: "Añádelo a tu perfil de LinkedIn",
  shareLabel: "Compartir",
  copyLink: "Copiar enlace",
  copied: "Copiado",
  codeLabel: "Código",
  shareText: "Participé en {event} con Houston.",
  verifyFoot: "Cualquiera puede comprobar que este certificado es real en",
};

export default {
  certCopy: { en, es },
  // Support address shown on every failure path. One place to change it.
  certSupportEmail: "hello@gethouston.ai",
};
