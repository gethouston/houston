import type { Learning, Routine } from "@houston/protocol";

export const stripLearningProvenance = ({
  taught_by: _person,
  mission_id: _mission,
  mission_title: _missionTitle,
  ...learning
}: Learning): Learning => learning;

export const stripLocalRoutineKeys = ({
  setup_activity_id: _local,
  created_by: _owner,
  auto_paused: _pause,
  snoozed: _snooze,
  ...routine
}: Routine): Routine => routine;
