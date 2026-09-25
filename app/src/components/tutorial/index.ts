/**
 * The tutorial family: the content-agnostic primitives every Academy lesson is
 * built from: the veil that dims the app around a real control, its placement
 * and measuring math, the video card that opens a lesson with the concept, and
 * the close every guided surface wears. Lessons supply the copy, the branding
 * and the step machine; nothing here knows which lesson is running.
 */
export { LessonVideoCard } from "./lesson-video-card";
export { TutorialDismissButton } from "./tutorial-dismiss-button";
export { type CardSize, placeCard } from "./tutorial-spotlight-geometry";
export { TutorialSpotlightVeil } from "./tutorial-spotlight-veil";
export { useSpotlightRects } from "./use-spotlight-rects";
