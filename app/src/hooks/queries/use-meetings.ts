import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NewMeeting, MeetingUpdate } from "@houston-ai/engine-client";
import { queryKeys } from "../../lib/query-keys";
import { tauriMeetings } from "../../lib/tauri";
import { showErrorToast } from "../../lib/error-toast";

export function useMeetings(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.meetings(agentPath ?? ""),
    queryFn: () => tauriMeetings.list(agentPath!),
    enabled: !!agentPath,
  });
}

export function useCreateMeeting(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewMeeting) => tauriMeetings.create(agentPath, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings(agentPath) });
    },
    onError: (err) => {
      showErrorToast("create_meeting", String(err), err);
    },
  });
}

export function useUpdateMeeting(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: MeetingUpdate }) =>
      tauriMeetings.update(agentPath, id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings(agentPath) });
    },
    onError: (err) => {
      showErrorToast("update_meeting", String(err), err);
    },
  });
}

export function useDeleteMeeting(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tauriMeetings.delete(agentPath, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings(agentPath) });
    },
    onError: (err) => {
      showErrorToast("delete_meeting", String(err), err);
    },
  });
}

export function useStartMeeting(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (meetingId: string) => tauriMeetings.start(agentPath, meetingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings(agentPath) });
    },
    onError: (err) => {
      showErrorToast("start_meeting", String(err), err);
    },
  });
}

export function useEndMeeting(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (meetingId: string) => tauriMeetings.end(agentPath, meetingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings(agentPath) });
    },
    onError: (err) => {
      showErrorToast("end_meeting", String(err), err);
    },
  });
}
