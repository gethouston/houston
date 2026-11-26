/**
 * Why an `app_to_board` span may not be a load time. The span runs from app
 * start, so a session that showed the sign-in screen counts sign-up, sign-in
 * and first-run setup (minutes), and a tab hidden before the board painted
 * counts time nobody waited (browsers also throttle hidden tabs). Either keeps
 * the span out of the gateway histogram; PostHog still gets it, tagged.
 */
export interface BoardLoadTags {
  firstRun: boolean;
  wasHidden: boolean;
}

export type VisibilityDoc = Pick<
  Document,
  "visibilityState" | "addEventListener"
>;

export class BoardLoad {
  private firstRun = false;
  private wasHidden = false;

  constructor(doc: VisibilityDoc | undefined) {
    if (!doc) return;
    const check = () => {
      if (doc.visibilityState === "hidden") this.wasHidden = true;
    };
    check();
    doc.addEventListener("visibilitychange", check);
  }

  signedOut(): void {
    this.firstRun = true;
  }

  tags(): BoardLoadTags {
    return { firstRun: this.firstRun, wasHidden: this.wasHidden };
  }
}
