/**
 * The concept vocabulary a team icon is searchable by: each rule pairs a run
 * of concept words with the icon keys that earn them, and the FIRST matching
 * rule also decides which shelf an icon lands on in the generated set.
 *
 * Its own module so the generator stays about parsing and emitting, and so a
 * vocabulary edit is a diff against words rather than against machinery.
 */

export const TAG_RULES = [
  [
    "money finance accounting payment banking business",
    /bank|dollar|euro|money|spreadsheet|calculator|chart|graph|dashboard|report|shop|cart|briefcase|project|rank/,
  ],
  [
    "people team community collaboration identity",
    /user|subgroup|conversation|face|anonymous|accessibility|car-pool|locker-room|shrug|heart|tee-shirt|thumbs|union/,
  ],
  [
    "communication message contact social support",
    /chat|email|phone|megaphone|mic|speaker|sound|subscribe|notified|resolved|hear|question-mark/,
  ],
  [
    "time schedule deadline planning calendar",
    /alarm|clock|hourglass|stopwatch|watch|air-tag/,
  ],
  [
    "travel transport vehicle journey logistics",
    /airplane|car|bus|bike|ship|taxi|train|tram|truck|routing|direction|compass|pin|world|africa|america|asia|australia|europe|garage|traffic|moving-staircase|anchor|astronaut|flag|rocket|sign|binocular/,
  ],
  ["food meal restaurant kitchen", /burger|coffee|biscuit|pizza|ramen|basket/],
  [
    "health medical wellness care science",
    /bandage|bones|chemist|cross|dna|dumbbell|health|mask|pill|safety|brain|foot-print|heart|hear/,
  ],
  [
    "nature outdoors environment weather",
    /flower|leaf|palm|tree|mountain|sun|moon|storm|wind|fire|feather|recycle|umbrella|surfer|dino/,
  ],
  [
    "tech devices software development computing",
    /ai|automation|battery|bug|chip|computer|connected|database|desktop|hack|mobile|modem|network|robot|server|tablet|terminal|electric-plug|click-button|bolt|cloud|cube|pointer|search/,
  ],
  [
    "documents writing notes content knowledge",
    /document|writing|write|book|bookmark|note|page|policy|signature|text|education|floppy|image/,
  ],
  [
    "charts data analytics metrics insights",
    /chart|graph|scatter|spreadsheet|dashboard|diagram|radar|speedometer|report|process/,
  ],
  [
    "sports games fitness recreation competition",
    /football|basketball|bowling|golf|joystick|poker|runner|soccer|stadium|tennis|ping-pong|jersey|dumbbell|dice/,
  ],
  [
    "tools building construction maintenance work",
    /brick|brush|bucket|cone|construction|crane|design-tools|eraser|factory|gears|ladder|paint|scissors|wall|wrench|extinguisher|magnet|flashlight|trash/,
  ],
  [
    "security privacy protection access safety",
    /shield|lock|face-id|anonymous|policy|alert|skull|hack|safety|judge/,
  ],
  [
    "ai intelligence automation assistant future",
    /(^|-)ai($|-)|robot|brain|automation|magic-wand|crystal-ball|astronaut|rocket/,
  ],
  [
    "creative design art media ideas",
    /camera|image|paint|brush|music|video|view-finder|magic|crystal|light-bulb|asterisk|circle|empty-circle|exclamation-mark|starred/,
  ],
  [
    "home place facilities operations",
    /home|bed|garage|factory|tower|spaces|wall|cloth|box|present|crown/,
  ],
];

export function tagsFor(key) {
  const tags = [];
  for (const [words, pattern] of TAG_RULES) {
    if (pattern.test(key)) tags.push(...words.split(" "));
  }
  if (tags.length < 2) tags.push("general", "symbol");
  return [...new Set(tags)].filter((tag) => !key.split("-").includes(tag));
}
