import {
  isArchivedLearning,
  type Learning,
  type Routine,
} from "@houston/protocol";

/**
 * A learning without its provenance. Provenance is ORG-LOCAL: `taught_by` names
 * a person in the exporter's workspace and the mission it came from is a
 * conversation the importer never had — neither means anything, nor is ours to
 * publish, on the other side. Same rule routines follow for `created_by` /
 * `setup_activity_id`; the learning itself travels. Applied on BOTH legs, so a
 * pack hand-built or produced by another build can never install a person from
 * the exporter's org or a mission id that resolves to something unrelated here.
 */
export const stripLearningProvenance = ({
  taught_by: _person,
  mission_id: _mission,
  mission_title: _missionTitle,
  ...learning
}: Learning): Learning => learning;

/**
 * The learnings that may leave this agent: active ones, provenance stripped.
 * An archived memory is history consolidation kept for this agent's own
 * recall; it is superseded, so it never travels in an export or a copy.
 */
export const shareableLearnings = (items: readonly Learning[]): Learning[] =>
  items
    .filter((learning) => !isArchivedLearning(learning))
    .map(stripLearningProvenance);

/** A routine without its machine- and account-local keys (see packAgent). */
export const stripLocalRoutineKeys = ({
  setup_activity_id: _local,
  created_by: _owner,
  auto_paused: _pause,
  snoozed: _snooze,
  ...routine
}: Routine): Routine => routine;
