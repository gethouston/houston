---
name: plan-a-trip
description: "Get a trip pack drafted so you can travel without dropping the rest of your week. I assemble a trip summary, an itinerary with flight and hotel search criteria, and a packing checklist adapted to the destination and trip type. Tell me where and when; I draft, you book."
version: 1
category: Operations
featured: no
image: clipboard
integrations: [googlecalendar, gmail]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Plan A Trip

## When to use

- "I'm going to {city}" / "plan my travel to {X}" / "plan a trip end-to-end".
- "flights for {conference}" / "I have a customer visit in {X}".
- "assemble my trip pack".

## Connections I need

I run external work through Composio. Before this skill runs I check the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Calendar** (Google Calendar, Outlook)  -  Required. Lets me see existing meetings during the trip window and pull events at the destination.
- **Inbox** (Gmail, Outlook)  -  Optional. Helps me find existing booking confirmations or itineraries.
- **Travel providers** (flight or hotel search)  -  Optional. If connected I surface real options; otherwise I write search criteria and you book yourself.

If no calendar is connected I stop and ask you to connect your calendar first.

## Information I need

I read your operations context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Destination and dates**  -  Required. Why I need it: nothing works without where and when. If missing I ask: "Where are you going and on what dates? A range works if you're still flexible."
- **Trip purpose**  -  Required. Why I need it: a customer visit, a conference, an offsite, and a personal trip each get different itineraries and packing lists. If missing I ask: "What's the purpose of the trip  -  customer visit, conference, offsite, or personal?"
- **Travel preferences**  -  Required. Why I need it: I draft against your real preferences instead of guessing. If missing I ask: "What are your travel defaults  -  preferred airline, seat, hotel chain, dietary needs, anything I should always include?"
- **Your timezone**  -  Optional. Why I need it: catches schedule conflicts during the trip window. If you don't have it I keep going with TBD using your operating context default.

## Steps
<!-- houston-workflow:v1 -->

1. **Read `context/operations-context.md`.** If missing/empty, stop. Ask user run `set-up-my-ops-info` first. Key-contacts + priorities anchor "what meetings while there?" section.

2. **Clarify trip.** Extract from message: destination(s), dates (or range), purpose (customer visit / conference / offsite / personal), traveling-with (solo / team). If dates or destination missing + material, ask ONE question.

3. **Read travel prefs.** Read `config/travel-prefs.json`. If missing/empty, ask ONE question: "What are your travel defaults  -  preferred airline, seat (aisle/window), hotel chain, dietary needs, accessibility?" Write answer to `config/travel-prefs.json`, continue.

4. **Read schedule.** Read `config/schedule-preferences.json` for timezone. Check calendar conflicts over trip window via `composio search calendar` (pull events from depart to return date).

5. **Resolve travel connections.** `composio search travel` → check connected travel providers (flight + hotel search). Note available categories. If none connected, proceed with search criteria only + note user books manually (no hardcoded provider assumption).

6. **Generate trip id**  -  `{YYYY-MM-DD}-{dest-slug}` (kebab-cased destination, e.g. `2026-05-12-sfo`).

7. **Write `travel/{trip-id}/trip.md`**  -  summary doc. Structure:

   ```markdown
   # Trip  -  {destination}, {dates}

   ## Purpose
   {1–2 lines  -  customer visit / conference / offsite / personal}

   ## Dates
   Depart {YYYY-MM-DD}  -  Return {YYYY-MM-DD} ({N nights})

   ## Destinations
   - {city}, {country/state}  -  {nights}

   ## Key meetings while there
   - {date}  -  {attendee or event}  -  prep: {ready | missing}
   - ... (pulled from connected calendar for events in the trip window)

   ## Open questions
   - {anything the user should clarify before booking}
   ```

8. **Write `travel/{trip-id}/itinerary.md`.** Structure:

   ```markdown
   ## Flights

   ### Outbound
   - Search criteria: {origin} → {destination}, {date},
     {airline pref}, {seat pref}, {max stops}, {price ceiling if
     mentioned}
   - Candidate options (if a provider is connected): {list}

   ### Return
   - Search criteria: {dest} → {origin}, {date}, {same prefs}
   - Candidate options: {list}

   ## Hotels
   - Search criteria: {chain pref}, {nights}, {neighborhood near
     key meetings}, {price ceiling if mentioned}
   - Candidate options: {list}

   ## Ground transport
   - Airport → hotel → meetings
   - Preferred mode: {ride-share / rental / public}

   ## Pending bookings
   - [ ] Outbound flight
   - [ ] Return flight
   - [ ] Hotel
   - [ ] Ground transport
   ```

9. **Write `travel/{trip-id}/packing.md`**  -  checklist adapted to destination weather (best guess from destination + dates; note assumption), trip type (formal customer visit vs conference vs offsite  -  clothing differs), and `config/travel-prefs.json` (dietary, accessibility). Sections: `## Essentials`, `## Work`, `## Clothing`, `## Health & toiletries`, `## Destination-specific`.

10. **Atomic writes**  -  `*.tmp` → rename per file.

11. **Append to `outputs.json`** with `type: "travel-pack"`, status "draft" until user approves bookings.

12. **Summarize to user.** "Trip pack ready at `travel/{trip-id}/`. Want me to search flight options via {available-provider} once you confirm dates, or are you booking yourself? Also  -  should I block your calendar during the trip?"

## Outputs

- `travel/{trip-id}/trip.md`
- `travel/{trip-id}/itinerary.md`
- `travel/{trip-id}/packing.md`
- Possibly written `config/travel-prefs.json` on first run
- Appends to `outputs.json` with `type: "travel-pack"`.

## What I never do

- **Book** flights, hotels, ground transport without explicit user approval on specific option.
- **Charge** any card.
- **Commit** to travel dates on your behalf.
- **Invent** destination event not on calendar or named by user.