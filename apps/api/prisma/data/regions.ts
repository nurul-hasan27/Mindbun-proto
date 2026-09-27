/**
 * Region presets for the synthetic dataset.
 *
 * The point of a preset is coherence: a therapist in Bengaluru speaks the
 * languages people there speak, keeps hours that make sense at that longitude,
 * and works with the kinds of people who actually seek help there. A random
 * generator would produce a Tamil speaker offering 6am London sessions, and any
 * test written against that would be testing nonsense.
 *
 * A future matching feature needs exactly this kind of realistic spread: plenty
 * of common combinations, and a handful of rare ones that prove the matching
 * does not collapse when the data is unusual.
 */

/** Times are minutes from local midnight in the region's own timezone. */
export interface AvailabilityTemplate {
  readonly dayOfWeek: string;
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface RegionPreset {
  readonly key: string;
  readonly timezone: string;
  readonly locations: readonly string[];
  /** Additional language codes beyond English, most comfortable first. */
  readonly extraLanguages: readonly string[];
  /** Plausible weekly availability in local time. */
  readonly windows: readonly AvailabilityTemplate[];
  /** Pulls the generated attributes towards what is typical here. */
  readonly styleBias: readonly string[];
  readonly approachBias: readonly string[];
  readonly areaBias: readonly string[];
  readonly contextBias: readonly string[];
}

const EVENINGS: readonly AvailabilityTemplate[] = [
  { dayOfWeek: 'TUESDAY', startMinute: 1080, endMinute: 1200 },
  { dayOfWeek: 'THURSDAY', startMinute: 1140, endMinute: 1260 },
  { dayOfWeek: 'SATURDAY', startMinute: 600, endMinute: 720 },
];

const EUROPEAN_EVENINGS: readonly AvailabilityTemplate[] = [
  { dayOfWeek: 'MONDAY', startMinute: 1020, endMinute: 1140 },
  { dayOfWeek: 'WEDNESDAY', startMinute: 1080, endMinute: 1200 },
  { dayOfWeek: 'FRIDAY', startMinute: 1020, endMinute: 1140 },
];

const US_MORNINGS_AND_EVENINGS: readonly AvailabilityTemplate[] = [
  { dayOfWeek: 'MONDAY', startMinute: 540, endMinute: 660 },
  { dayOfWeek: 'WEDNESDAY', startMinute: 1140, endMinute: 1260 },
  { dayOfWeek: 'SATURDAY', startMinute: 600, endMinute: 720 },
];

const PACIFIC: readonly AvailabilityTemplate[] = [
  { dayOfWeek: 'TUESDAY', startMinute: 540, endMinute: 660 },
  { dayOfWeek: 'THURSDAY', startMinute: 1020, endMinute: 1140 },
  { dayOfWeek: 'SATURDAY', startMinute: 660, endMinute: 780 },
];

export const regionPresets: readonly RegionPreset[] = [
  {
    key: 'bengaluru',
    timezone: 'Asia/Kolkata',
    locations: ['Bengaluru, India'],
    extraLanguages: ['kn', 'hi', 'ta'],
    windows: EVENINGS,
    styleBias: ['warm', 'structured', 'reflective'],
    approachBias: ['exploratory', 'integrative', 'reflective'],
    areaBias: ['work-stress', 'career-transitions', 'life-transitions'],
    contextBias: ['working-across-cultures', 'international-students', 'family-expectations'],
  },
  {
    key: 'mumbai',
    timezone: 'Asia/Kolkata',
    locations: ['Mumbai, India'],
    extraLanguages: ['hi', 'mr', 'gu'],
    windows: EVENINGS,
    styleBias: ['direct', 'warm', 'structured'],
    approachBias: ['structured', 'solution-focused', 'integrative'],
    areaBias: ['career-transitions', 'relationships', 'work-stress'],
    contextBias: ['indian-diaspora', 'cross-cultural-relationships', 'family-expectations'],
  },
  {
    key: 'kolkata',
    timezone: 'Asia/Kolkata',
    locations: ['Kolkata, India'],
    extraLanguages: ['bn', 'hi'],
    windows: EVENINGS,
    styleBias: ['gentle', 'reflective', 'warm'],
    approachBias: ['reflective', 'exploratory', 'integrative'],
    areaBias: ['grief-and-loss', 'family-dynamics', 'identity-exploration'],
    contextBias: ['family-expectations', 'indian-diaspora'],
  },
  {
    key: 'chennai',
    timezone: 'Asia/Kolkata',
    locations: ['Chennai, India'],
    extraLanguages: ['ta', 'hi', 'te'],
    windows: EVENINGS,
    styleBias: ['structured', 'direct', 'warm'],
    approachBias: ['structured', 'solution-focused', 'reflective'],
    areaBias: ['parenting', 'career-transitions', 'work-stress'],
    contextBias: ['family-expectations', 'international-students'],
  },
  {
    key: 'kochi',
    timezone: 'Asia/Kolkata',
    locations: ['Kochi, India'],
    extraLanguages: ['ml', 'en', 'ta'],
    windows: EVENINGS,
    styleBias: ['gentle', 'warm', 'exploratory'],
    approachBias: ['exploratory', 'reflective', 'integrative'],
    areaBias: ['grief-and-loss', 'identity-exploration', 'relationships'],
    contextBias: ['relocation', 'international-students', 'third-culture-upbringing'],
  },
  {
    key: 'hyderabad',
    timezone: 'Asia/Kolkata',
    locations: ['Hyderabad, India'],
    extraLanguages: ['te', 'hi', 'ta'],
    windows: EVENINGS,
    styleBias: ['structured', 'reflective', 'direct'],
    approachBias: ['integrative', 'structured', 'exploratory'],
    areaBias: ['burnout', 'career-transitions', 'self-worth'],
    contextBias: ['working-across-cultures', 'international-students'],
  },
  {
    key: 'delhi',
    timezone: 'Asia/Kolkata',
    locations: ['New Delhi, India'],
    extraLanguages: ['hi', 'pa', 'ur'],
    windows: EVENINGS,
    styleBias: ['direct', 'structured', 'reflective'],
    approachBias: ['structured', 'solution-focused', 'reflective'],
    areaBias: ['career-transitions', 'work-stress', 'family-dynamics'],
    contextBias: ['family-expectations', 'relocation', 'cross-cultural-relationships'],
  },
  {
    key: 'ahmedabad',
    timezone: 'Asia/Kolkata',
    locations: ['Ahmedabad, India'],
    extraLanguages: ['gu', 'hi'],
    windows: EVENINGS,
    styleBias: ['warm', 'direct', 'gentle'],
    approachBias: ['exploratory', 'solution-focused', 'reflective'],
    areaBias: ['relationships', 'parenting', 'self-worth'],
    contextBias: ['family-expectations', 'working-across-cultures'],
  },
  {
    key: 'london',
    timezone: 'Europe/London',
    locations: ['London, UK'],
    extraLanguages: ['hi', 'ta', 'ur'],
    windows: EUROPEAN_EVENINGS,
    styleBias: ['warm', 'exploratory', 'reflective'],
    approachBias: ['exploratory', 'integrative', 'reflective'],
    areaBias: ['identity-exploration', 'adjustment-to-relocation', 'life-transitions'],
    contextBias: ['indian-diaspora', 'third-culture-upbringing', 'cross-cultural-relationships'],
  },
  {
    key: 'manchester',
    timezone: 'Europe/London',
    locations: ['Manchester, UK'],
    extraLanguages: ['hi', 'pa'],
    windows: EUROPEAN_EVENINGS,
    styleBias: ['gentle', 'warm', 'exploratory'],
    approachBias: ['exploratory', 'reflective', 'solution-focused'],
    areaBias: ['adjustment-to-relocation', 'burnout', 'life-transitions'],
    contextBias: ['indian-diaspora', 'relocation', 'international-students'],
  },
  {
    key: 'edinburgh',
    timezone: 'Europe/London',
    locations: ['Edinburgh, UK'],
    extraLanguages: ['en', 'fr'],
    windows: EUROPEAN_EVENINGS,
    styleBias: ['reflective', 'gentle', 'structured'],
    approachBias: ['reflective', 'exploratory', 'integrative'],
    areaBias: ['grief-and-loss', 'identity-exploration', 'creative-practice'],
    contextBias: ['relocation', 'working-across-cultures'],
  },
  {
    key: 'berlin',
    timezone: 'Europe/Berlin',
    locations: ['Berlin, Germany'],
    extraLanguages: ['de', 'ru', 'tr'],
    windows: EUROPEAN_EVENINGS,
    styleBias: ['direct', 'structured', 'exploratory'],
    approachBias: ['structured', 'integrative', 'solution-focused'],
    areaBias: ['career-transitions', 'adjustment-to-relocation', 'identity-exploration'],
    contextBias: ['relocation', 'cross-cultural-relationships', 'working-across-cultures'],
  },
  {
    key: 'amsterdam',
    timezone: 'Europe/Amsterdam',
    locations: ['Amsterdam, Netherlands'],
    extraLanguages: ['nl', 'de', 'en'],
    windows: EUROPEAN_EVENINGS,
    styleBias: ['exploratory', 'warm', 'reflective'],
    approachBias: ['integrative', 'exploratory', 'reflective'],
    areaBias: ['identity-exploration', 'relationships', 'life-transitions'],
    contextBias: ['third-culture-upbringing', 'relocation', 'cross-cultural-relationships'],
  },
  {
    key: 'gothenburg',
    timezone: 'Europe/Stockholm',
    locations: ['Gothenburg, Sweden'],
    extraLanguages: ['sv', 'en', 'ar'],
    windows: EUROPEAN_EVENINGS,
    styleBias: ['gentle', 'reflective', 'warm'],
    approachBias: ['reflective', 'exploratory', 'integrative'],
    areaBias: ['adjustment-to-relocation', 'life-transitions', 'work-stress'],
    contextBias: ['relocation', 'cross-cultural-relationships', 'working-across-cultures'],
  },
  {
    key: 'lisbon',
    timezone: 'Europe/Lisbon',
    locations: ['Lisbon, Portugal'],
    extraLanguages: ['pt', 'en', 'fr'],
    windows: EUROPEAN_EVENINGS,
    styleBias: ['warm', 'gentle', 'exploratory'],
    approachBias: ['exploratory', 'solution-focused', 'integrative'],
    areaBias: ['adjustment-to-relocation', 'creative-practice', 'relationships'],
    contextBias: ['relocation', 'cross-cultural-relationships', 'third-culture-upbringing'],
  },
  {
    key: 'warsaw',
    timezone: 'Europe/Warsaw',
    locations: ['Warsaw, Poland'],
    extraLanguages: ['pl', 'en', 'ru'],
    windows: EUROPEAN_EVENINGS,
    styleBias: ['structured', 'direct', 'warm'],
    approachBias: ['structured', 'solution-focused', 'reflective'],
    areaBias: ['work-stress', 'career-transitions', 'burnout'],
    contextBias: ['relocation', 'working-across-cultures'],
  },
  {
    key: 'new-york',
    timezone: 'America/New_York',
    locations: ['New York, USA'],
    extraLanguages: ['es', 'hi', 'en'],
    windows: US_MORNINGS_AND_EVENINGS,
    styleBias: ['direct', 'warm', 'exploratory'],
    approachBias: ['integrative', 'exploratory', 'solution-focused'],
    areaBias: ['relationships', 'career-transitions', 'identity-exploration'],
    contextBias: ['cross-cultural-relationships', 'indian-diaspora', 'third-culture-upbringing'],
  },
  {
    key: 'chicago',
    timezone: 'America/Chicago',
    locations: ['Chicago, USA'],
    extraLanguages: ['es', 'en', 'hi'],
    windows: US_MORNINGS_AND_EVENINGS,
    styleBias: ['structured', 'gentle', 'reflective'],
    approachBias: ['reflective', 'integrative', 'structured'],
    areaBias: ['family-dynamics', 'life-transitions', 'self-worth'],
    contextBias: ['indian-diaspora', 'family-expectations', 'working-across-cultures'],
  },
  {
    key: 'austin',
    timezone: 'America/Chicago',
    locations: ['Austin, USA'],
    extraLanguages: ['en', 'es'],
    windows: US_MORNINGS_AND_EVENINGS,
    styleBias: ['direct', 'exploratory', 'warm'],
    approachBias: ['solution-focused', 'integrative', 'exploratory'],
    areaBias: ['career-transitions', 'creative-practice', 'self-worth'],
    contextBias: ['relocation', 'working-across-cultures'],
  },
  {
    key: 'san-francisco',
    timezone: 'America/Los_Angeles',
    locations: ['San Francisco, USA'],
    extraLanguages: ['zh', 'es', 'en'],
    windows: PACIFIC,
    styleBias: ['exploratory', 'warm', 'reflective'],
    approachBias: ['exploratory', 'integrative', 'reflective'],
    areaBias: ['identity-exploration', 'relationships', 'burnout'],
    contextBias: [
      'third-culture-upbringing',
      'cross-cultural-relationships',
      'international-students',
    ],
  },
  {
    key: 'seattle',
    timezone: 'America/Los_Angeles',
    locations: ['Seattle, USA'],
    extraLanguages: ['en', 'zh'],
    windows: PACIFIC,
    styleBias: ['gentle', 'structured', 'exploratory'],
    approachBias: ['integrative', 'structured', 'exploratory'],
    areaBias: ['grief-and-loss', 'life-transitions', 'creative-practice'],
    contextBias: ['relocation', 'international-students'],
  },
  {
    key: 'toronto',
    timezone: 'America/Toronto',
    locations: ['Toronto, Canada'],
    extraLanguages: ['fr', 'en', 'pa'],
    windows: US_MORNINGS_AND_EVENINGS,
    styleBias: ['warm', 'reflective', 'gentle'],
    approachBias: ['reflective', 'exploratory', 'integrative'],
    areaBias: ['adjustment-to-relocation', 'family-dynamics', 'identity-exploration'],
    contextBias: ['indian-diaspora', 'third-culture-upbringing', 'cross-cultural-relationships'],
  },
  {
    key: 'dubai',
    timezone: 'Asia/Dubai',
    locations: ['Dubai, UAE'],
    extraLanguages: ['ar', 'hi', 'en'],
    windows: EVENINGS,
    styleBias: ['structured', 'direct', 'warm'],
    approachBias: ['structured', 'integrative', 'solution-focused'],
    areaBias: ['work-stress', 'career-transitions', 'family-dynamics'],
    contextBias: ['relocation', 'cross-cultural-relationships', 'working-across-cultures'],
  },
  {
    key: 'singapore',
    timezone: 'Asia/Singapore',
    locations: ['Singapore'],
    extraLanguages: ['zh', 'ta', 'en'],
    windows: EVENINGS,
    styleBias: ['structured', 'warm', 'exploratory'],
    approachBias: ['integrative', 'structured', 'reflective'],
    areaBias: ['work-stress', 'life-transitions', 'career-transitions'],
    contextBias: ['third-culture-upbringing', 'international-students', 'working-across-cultures'],
  },
  {
    key: 'melbourne',
    timezone: 'Australia/Melbourne',
    locations: ['Melbourne, Australia'],
    extraLanguages: ['en', 'hi', 'zh'],
    windows: PACIFIC,
    styleBias: ['gentle', 'exploratory', 'warm'],
    approachBias: ['exploratory', 'reflective', 'integrative'],
    areaBias: ['adjustment-to-relocation', 'life-transitions', 'identity-exploration'],
    contextBias: ['indian-diaspora', 'relocation', 'third-culture-upbringing'],
  },
  {
    key: 'auckland',
    timezone: 'Pacific/Auckland',
    locations: ['Auckland, New Zealand'],
    extraLanguages: ['en', 'mi', 'zh'],
    windows: PACIFIC,
    styleBias: ['warm', 'reflective', 'gentle'],
    approachBias: ['reflective', 'exploratory', 'solution-focused'],
    areaBias: ['adjustment-to-relocation', 'grief-and-loss', 'relationships'],
    contextBias: ['relocation', 'cross-cultural-relationships', 'international-students'],
  },
  {
    key: 'cape-town',
    timezone: 'Africa/Johannesburg',
    locations: ['Cape Town, South Africa'],
    extraLanguages: ['en', 'af'],
    windows: EUROPEAN_EVENINGS,
    styleBias: ['warm', 'direct', 'exploratory'],
    approachBias: ['exploratory', 'integrative', 'structured'],
    areaBias: ['identity-exploration', 'life-transitions', 'creative-practice'],
    contextBias: ['cross-cultural-relationships', 'relocation', 'working-across-cultures'],
  },
  {
    key: 'sao-paulo',
    timezone: 'America/Sao_Paulo',
    locations: ['São Paulo, Brazil'],
    extraLanguages: ['pt', 'es', 'en'],
    windows: US_MORNINGS_AND_EVENINGS,
    styleBias: ['warm', 'direct', 'structured'],
    approachBias: ['integrative', 'structured', 'exploratory'],
    areaBias: ['relationships', 'family-dynamics', 'career-transitions'],
    contextBias: ['relocation', 'cross-cultural-relationships', 'working-across-cultures'],
  },
] as const;

export const regionPresetsByKey: ReadonlyMap<string, RegionPreset> = new Map(
  regionPresets.map((preset) => [preset.key, preset]),
);
