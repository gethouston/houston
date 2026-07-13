/**
 * A fully-populated, schema-valid AgentIR 2.0.0 fixture. Every optional field is
 * present so the JSON-Schema drift test can compare property keys against it, and
 * the skill bodies are real SKILL.md files (frontmatter + markdown) so the
 * frontmatter parser can be exercised against them.
 */
import type { AgentIR } from "../ir";

const triageSkillBody = `---
title: Triage a batch of emails
description: Group a pasted set of emails into Urgent, Today, and Later.
category: productivity
integrations:
  - GMAIL
featured: yes
---

# Triage a batch of emails

1. Read every email the user pastes.
2. Bucket each into Urgent / Today / Later.
3. Give a one-line reason per bucket assignment.
`;

const replySkillBody = `---
title: Draft quick replies
description: Write short, friendly replies for the easy emails.
category: productivity
---

# Draft quick replies

For each email marked easy, draft a 2-3 sentence reply in a warm tone. Leave a
[bracket] where the user must add a personal detail.
`;

export const exampleAgentIr: AgentIR = {
  irVersion: "2.0.0",
  identity: {
    slug: "inbox-triage-helper",
    name: "Inbox Triage Helper",
    tagline: "Sorts your morning email into what matters and what can wait.",
    description:
      "A friendly assistant that reads through a batch of emails you paste in, " +
      "groups them by urgency, and drafts quick replies for the easy ones.",
    icon: { kind: "emoji", value: "📬" },
    color: "#2f6df6",
    category: "productivity",
    tags: ["email", "productivity", "inbox"],
    creator: {
      displayName: "Avery Chen",
      url: "https://agents.gethouston.ai/@avery",
    },
  },
  instructions:
    "You are a calm, efficient inbox assistant. You help busy people decide what " +
    "to read first and draft short, warm replies. You never invent facts about " +
    "the sender; you only work from the text the user provides.",
  skills: [
    { slug: "triage-emails", body: triageSkillBody },
    { slug: "draft-replies", body: replySkillBody },
  ],
  learnings: [
    {
      id: "learning-tone",
      text: "This user prefers replies under three sentences and no exclamation marks.",
      createdAt: "2026-05-14T09:30:00.000Z",
    },
    {
      id: "learning-vip",
      text: "Emails from the finance team are always Urgent, even without a deadline.",
      createdAt: "2026-05-20T17:05:00.000Z",
    },
  ],
  integrations: ["GMAIL", "GOOGLE_CALENDAR"],
  provenance: {
    createdVia: "houston",
    exporter: "houston-desktop",
    houstonVersion: "0.6.0",
    anonymized: true,
  },
};
