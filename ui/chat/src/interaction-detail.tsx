import { INTERACTION_DETAIL_CLASS } from "./interaction-detail-model";

/** The verbatim material a question is about, shown whole (see the model). */
export function InteractionDetail({ detail }: { detail: string }) {
  return <pre className={INTERACTION_DETAIL_CLASS}>{detail}</pre>;
}
