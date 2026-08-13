/**
 * The tutorial family: the content-agnostic primitives every guided lesson is
 * built from — the click-through spotlight (the HOW position), the narration
 * center card (the WHAT position), the video card that opens a lesson with the
 * concept, the close every guided surface wears, and the anchor vocabulary that
 * lets a step point at a real control.
 * Lessons supply the copy, the branding and the step
 * machine; nothing here knows which lesson is running.
 */
export { LessonVideoCard } from "./lesson-video-card";
export {
  type LabeledChecklistItem,
  TutorialCenterCard,
} from "./tutorial-center-card";
export { TutorialDismissButton } from "./tutorial-dismiss-button";
export { TutorialSpotlight } from "./tutorial-spotlight";
export {
  blockerPanels,
  CARD_W,
  type CardSize,
  type Placement,
  placeCard,
  type Rect,
  useSpotlightRects,
  type Viewport,
} from "./tutorial-spotlight-geometry";
export { TutorialSpotlightVeil } from "./tutorial-spotlight-veil";
export {
  TUTORIAL_TARGETS,
  type TutorialTarget,
  tutorialAnchor,
  tutorialSelector,
} from "./tutorial-targets";
