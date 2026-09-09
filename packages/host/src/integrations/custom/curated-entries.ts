/**
 * The curated entries the agent can discover before the user adds them.
 * Keep slugs in lockstep with the frontend catalog
 * (app/src/components/integrations/curated-entries.ts); the connect dialog
 * there is what a `request_connection` for one of these opens.
 */
export interface CuratedEntry {
  slug: string;
  name: string;
  /** English blurb for the model's search results (the agent answers the
   *  user in their own language regardless). */
  description: string;
  /** Extra match keywords beyond name/slug/description tokens — include
   *  Spanish/Portuguese terms, since users (and thus model queries) use them. */
  keywords: readonly string[];
  /** Other names the service goes by, resolved as an explicit `app` scope
   *  exactly like the real name ("ghl" → HighLevel). Keywords only rank the
   *  unscoped search; a scope naming an alias would otherwise miss. */
  aliases?: readonly string[];
}

export const CURATED_ENTRIES: readonly CuratedEntry[] = [
  {
    slug: "croma",
    name: "Croma",
    description:
      "Official government records from Colombia, Peru and Mexico: court cases and lawsuits, company and tax registries, vehicles and people lookups backed by official sources (Rama Judicial, RUES, SUNAT, DOF, SCJN and more).",
    keywords: [
      "legal",
      "judicial",
      "background",
      "compliance",
      "screening",
      "registry",
      "gobierno",
      "registros",
      "expediente",
      "juzgado",
      "demanda",
      "empresa",
      "empresas",
      "vehiculo",
      "antecedentes",
      "processo",
      "tribunal",
      "veiculo",
    ],
  },
  {
    slug: "highlevel",
    name: "HighLevel",
    description:
      "HighLevel (GoHighLevel, GHL) CRM and marketing platform: contacts and leads, conversations and messages (SMS, email), opportunities and pipelines, calendars and appointments, invoices and payments, social posts and blog posts. One sub-account per connection.",
    keywords: [
      "crm",
      "leads",
      "contacts",
      "pipeline",
      "pipelines",
      "opportunities",
      "deals",
      "appointments",
      "calendar",
      "invoices",
      "payments",
      "sms",
      "marketing",
      "agency",
      "funnel",
      "clientes",
      "contactos",
      "embudo",
      "oportunidades",
      "citas",
      "facturas",
      "contatos",
      "funil",
      "agendamentos",
      "faturas",
    ],
    aliases: ["gohighlevel", "go high level", "ghl", "leadconnector"],
  },
  {
    slug: "manychat",
    name: "ManyChat",
    description:
      "ManyChat chat marketing and chatbot platform: contacts (subscribers) on Instagram DM, Facebook Messenger, WhatsApp, SMS and email, tags, custom fields, bot fields, automation flows and sending messages. Connects with the account's API key.",
    keywords: [
      "chatbot",
      "chat",
      "instagram",
      "messenger",
      "whatsapp",
      "sms",
      "dm",
      "subscribers",
      "contacts",
      "tags",
      "flows",
      "automation",
      "broadcast",
      "marketing",
      "contactos",
      "etiquetas",
      "mensajes",
      "automatizacion",
      "automatización",
      "suscriptores",
      "contatos",
      "mensagens",
      "automacao",
      "automação",
      "assinantes",
    ],
    // Composio's own slug for the (empty) toolkit, so a scope the model
    // learned there still lands here.
    aliases: ["many chat", "many_chat"],
  },
];
