# app/src/lib/manager-onboarding: design decisions

Covers `app/src/lib/manager-onboarding/`: the scripted AI Manager onboarding conversation. File paths in this record are relative to `app/src/`.

## Onboarding is a scripted conversation

Every manager line during onboarding is fixed, authored copy; nothing is generated. Lines are data with stable keys and the view resolves copy. The conversation is derived from persisted parts (provider, survey record, team state), so a resumed run replays to the same place.

Lives in `lib/manager-onboarding/script.ts`, `lib/manager-onboarding/script-types.ts`, `lib/manager-onboarding/survey-script.ts`, `lib/manager-onboarding/team-script.ts`.

## Only the latest answer can change

Only the latest survey or team answer offers "Change answer", and only until it hires anyone.

Lives in `lib/manager-onboarding/changeable.ts`, `lib/manager-onboarding/team-script.ts`.

## Earlier hires are read live

The set of agents that existed when the team step opened is fixed once, but their names come from the live list so renames and removals show.

Lives in `lib/manager-onboarding/earlier-hires.ts`.

## The finished conversation becomes real history

The onboarding transcript is imported into the manager's chat as real messages under a fixed import name, so completing twice writes once, and it is ordered before anything else even when it lands late.

Lives in `lib/manager-onboarding/transcript.ts`.

## Goal handoff

The goal is sent as the first real turn of the manager's chat right after onboarding. Taking the pending handoff prevents a remounted chat from sending twice; a failed send puts it back. A goal card may restart its goal with the hire grant only for the goal the person set.

Lives in `lib/manager-onboarding/handoff-prompt.ts`, `lib/manager-onboarding/send-handoff.ts`, `lib/manager-onboarding/goal-handoff.ts`, `lib/manager-onboarding/goal-progress.ts`.

## Manager reach follows capabilities

What the manager says it can do matches what the deployment serves beyond missions and hiring.

Lives in `lib/manager-onboarding/manager-reach.ts`, `lib/manager-onboarding/closing-script.ts`.

## Cards ride markers

The two onboarding moments drawn as cards ride inside the message behind markers.

Lives in `lib/manager-onboarding/onboarding-card-markers.ts`, `lib/manager-onboarding/onboarding-feed.ts`.
