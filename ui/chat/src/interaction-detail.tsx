import { INTERACTION_DETAIL_CLASS } from "./interaction-detail-model";

export function InteractionDetail({ detail }: { detail: string }) {
  return <pre className={INTERACTION_DETAIL_CLASS}>{detail}</pre>;
}
