import { currentCredentialScope } from "../session/acting-context";
import { credentialFingerprint } from "./credential-fingerprint";
import {
  forgetProviderMarks,
  readProviderMarks,
  writeProviderMarks,
} from "./provider-marks";

const QUOTA_MARK_TTL_MS = 60 * 60 * 1000;

function markFor(id: string): string {
  return `${currentCredentialScope().key}:${id}`;
}

export function noteAuthFailure(id: string, fingerprint?: string): void {
  const marks = readProviderMarks();
  marks.authFailed.set(markFor(id), fingerprint ?? credentialFingerprint(id));
  writeProviderMarks(marks);
}

export function noteQuotaExhausted(
  id: string,
  resetsAt: string | null,
  fingerprint?: string,
): void {
  const parsed = resetsAt ? Date.parse(resetsAt) : Number.NaN;
  const marks = readProviderMarks();
  marks.quotaExhausted.set(markFor(id), {
    fingerprint: fingerprint ?? credentialFingerprint(id),
    expiresAt: Number.isNaN(parsed) ? Date.now() + QUOTA_MARK_TTL_MS : parsed,
  });
  writeProviderMarks(marks);
}

export function clearProviderMarks(id: string): void {
  const marks = readProviderMarks();
  const mark = markFor(id);
  const hadAuth = marks.authFailed.delete(mark);
  const hadQuota = marks.quotaExhausted.delete(mark);
  if (!hadAuth && !hadQuota) return;
  writeProviderMarks(marks);
}

export function authFailureActive(id: string, fingerprint?: string): boolean {
  const marks = readProviderMarks();
  const mark = markFor(id);
  const marked = marks.authFailed.get(mark);
  if (marked === undefined) return false;
  if (marked !== (fingerprint ?? credentialFingerprint(id))) {
    marks.authFailed.delete(mark);
    writeProviderMarks(marks);
    return false;
  }
  return true;
}

export function quotaExhaustedActive(
  id: string,
  fingerprint?: string,
): boolean {
  const marks = readProviderMarks();
  const mark = markFor(id);
  const marked = marks.quotaExhausted.get(mark);
  if (marked === undefined) return false;
  const stale =
    marked.expiresAt <= Date.now() ||
    marked.fingerprint !== (fingerprint ?? credentialFingerprint(id));
  if (stale) {
    marks.quotaExhausted.delete(mark);
    writeProviderMarks(marks);
    return false;
  }
  return true;
}

export function resetAuthFailures(): void {
  forgetProviderMarks();
}
