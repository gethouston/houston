import { COMMERCE_AND_HOSPITALITY_WORLDS } from "./agent-role-catalog-commerce-and-hospitality.ts";
import { FIELD_SERVICES_WORLDS } from "./agent-role-catalog-field-services.ts";
import { HEALTH_AND_CARE_WORLDS } from "./agent-role-catalog-health-and-care.ts";
import { INDUSTRY_AND_SUPPLY_WORLDS } from "./agent-role-catalog-industry-and-supply.ts";
import { LEARNING_AND_COMMUNITY_WORLDS } from "./agent-role-catalog-learning-and-community.ts";
import { MEDIA_AND_CREATIVE_WORLDS } from "./agent-role-catalog-media-and-creative.ts";
import { MONEY_AND_LAW_WORLDS } from "./agent-role-catalog-money-and-law.ts";
import { PROPERTY_AND_BUILDING_WORLDS } from "./agent-role-catalog-property-and-building.ts";
import { SALES_AND_PEOPLE_WORLDS } from "./agent-role-catalog-sales-and-people.ts";
import { TECHNOLOGY_WORLDS } from "./agent-role-catalog-technology.ts";

export const AGENT_CONTEXT_ROLES = {
  ...MONEY_AND_LAW_WORLDS,
  ...PROPERTY_AND_BUILDING_WORLDS,
  ...INDUSTRY_AND_SUPPLY_WORLDS,
  ...COMMERCE_AND_HOSPITALITY_WORLDS,
  ...HEALTH_AND_CARE_WORLDS,
  ...LEARNING_AND_COMMUNITY_WORLDS,
  ...TECHNOLOGY_WORLDS,
  ...MEDIA_AND_CREATIVE_WORLDS,
  ...SALES_AND_PEOPLE_WORLDS,
  ...FIELD_SERVICES_WORLDS,
} as const;

export const AGENT_COMMON_ROLES = [
  "executive_assistant",
  "operations_coordinator",
  "operations_manager",
  "finance_manager",
  "researcher",
  "writer",
  "analyst",
  "support_agent",
  "recruiter",
  "project_coordinator",
  "scheduler",
  "data_entry_clerk",
] as const;
