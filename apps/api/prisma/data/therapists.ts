/**
 * The synthetic therapist dataset.
 *
 * Every person here is invented for this prototype. No name, biography, or
 * profile has been copied from a directory, a website, or a real therapist, and
 * no data has been scraped. The names are plausible and the situations are
 * common; the people are not real.
 *
 * The written parts (name, headline, biography) are authored by hand. The
 * structured parts (languages, approaches, areas of work, styles, context,
 * availability) are derived deterministically from the region preset in
 * `regions.ts`, so that the combinations are coherent rather than random — see
 * docs/domain-model.md.
 *
 * Coverage is deliberate: every language, approach, style, area and context in
 * the vocabulary appears many times, while rare combinations (a Malayalam
 * speaker, third-culture upbringing) are present but not typical.
 */

export interface TherapistSeed {
  readonly displayName: string;
  readonly headline: string;
  readonly bio: string;
  /** Key into `regionPresets`; decides timezone, languages and availability. */
  readonly region: string;
  readonly yearsOfExperience: number;
}

export const therapistSeeds: readonly TherapistSeed[] = [
  // ---------------------------------------------------------------- India
  {
    displayName: 'Ananya Mehra',
    headline: 'Warm, curious, reflective',
    bio: 'Therapy can be a place to slow down, and I try to make that possible from the first few minutes. I work best with people who are thinking something through rather than trying to be fixed. Expect me to ask a lot of questions, and to be comfortable with silence.',
    region: 'bengaluru',
    yearsOfExperience: 9,
  },
  {
    displayName: 'Rohan Deshpande',
    headline: 'Direct, structured, practical',
    bio: 'I like sessions with a shape to them: what we agreed, what changed, what we are trying next. If you have been in therapy before and found it vague, I am probably a better fit than a more free-associative therapist would be.',
    region: 'bengaluru',
    yearsOfExperience: 14,
  },
  {
    displayName: 'Meera Krishnan',
    headline: 'Gentle, unhurried, careful',
    bio: 'Some things need more time than a weekly hour allows, and I would rather go slowly than get through a list. I work a lot with people who are between things, and do not yet have language for where they are.',
    region: 'chennai',
    yearsOfExperience: 7,
  },
  {
    displayName: 'Arjun Nambiar',
    headline: 'Reflective, thoughtful, steady',
    bio: 'I am interested in the patterns underneath the problem: the same argument in five different relationships, the same hesitation in five different decisions. Sessions are unhurried, and I will often sit with you rather than offer an answer.',
    region: 'kochi',
    yearsOfExperience: 11,
  },
  {
    displayName: 'Priya Raghavan',
    headline: 'Warm, structured, grounded',
    bio: 'I bring a fair amount of structure to sessions, because a lot of people arrive not knowing what to expect from the hour. We will set out what we are doing and why, and you can change it at any point.',
    region: 'chennai',
    yearsOfExperience: 6,
  },
  {
    displayName: 'Devika Menon',
    headline: 'Gentle, reflective, patient',
    bio: 'Therapy goes at the speed of the person in the room, not the speed of the technique. I work mostly with grief, endings, and the long quiet afterwards, and I do not rush anyone through it.',
    region: 'kochi',
    yearsOfExperience: 12,
  },
  {
    displayName: 'Kabir Sandhu',
    headline: 'Direct, warm, candid',
    bio: 'I will say what I notice, including the uncomfortable things, and I will do it respectfully. That suits people who have spent a lot of time being careful with their therapists.',
    region: 'delhi',
    yearsOfExperience: 10,
  },
  {
    displayName: 'Sanjana Iyer',
    headline: 'Reflective, warm, integrative',
    bio: 'I draw on more than one way of thinking, and I will usually tell you which one we are in and why. A lot of my work is with people who have left one context for another and are still holding both.',
    region: 'hyderabad',
    yearsOfExperience: 8,
  },
  {
    displayName: 'Vikram Chatterjee',
    headline: 'Structured, calm, methodical',
    bio: 'I work best with people who want to know what is happening and why. We will keep track of what we try, what helps, and what does not, and change course when the evidence says to.',
    region: 'kolkata',
    yearsOfExperience: 16,
  },
  {
    displayName: 'Aditi Bhattacharya',
    headline: 'Gentle, exploratory, unhurried',
    bio: 'I do not have a technique to offer you, and I do not think you need one yet. What I can offer is attention: the sense that someone is actually listening to the detail of what you are saying.',
    region: 'kolkata',
    yearsOfExperience: 5,
  },
  {
    displayName: 'Debashish Sengupta',
    headline: 'Reflective, patient, grounded',
    bio: 'I work with people who are deciding whether to stay in a city they did not choose, and with the families they are leaving behind. I have moved countries twice myself, and it did not get easier.',
    region: 'kolkata',
    yearsOfExperience: 13,
  },
  {
    displayName: 'Rhea Kapoor',
    headline: 'Warm, direct, grounded',
    bio: 'Sessions with me are plain-spoken and fairly brisk. I like working with people who are good at being honest with themselves and are looking for somewhere to put it.',
    region: 'delhi',
    yearsOfExperience: 13,
  },
  {
    displayName: 'Nikhil Pillai',
    headline: 'Reflective, exploratory, careful',
    bio: 'I am drawn to identity questions: the ones that only show up once the old answers stop working. Much of my work is with people in their twenties and thirties, and with those in the middle of a move between countries.',
    region: 'hyderabad',
    yearsOfExperience: 9,
  },
  {
    displayName: 'Tara Joshi',
    headline: 'Structured, supportive, practical',
    bio: 'I work with people who are tired, stretched, or close to a limit, and who want help deciding what to do about it. Practical, unglamorous, and I will keep an eye on whether this is actually working.',
    region: 'mumbai',
    yearsOfExperience: 15,
  },
  {
    displayName: 'Ayaan Qureshi',
    headline: 'Direct, warm, no-nonsense',
    bio: 'I am not going to be the therapist who nods and says nothing helpful. I will ask you the question you came in hoping not to be asked, and then we will deal with it.',
    region: 'mumbai',
    yearsOfExperience: 7,
  },

  // ------------------------------------------------------------- United Kingdom
  {
    displayName: 'Priya Venkataraman',
    headline: 'Warm, culturally fluent, careful',
    bio: 'I work with people who sit between two cultures, two families, or two versions of themselves, and who have run out of easy language for it. I am comfortable with the ambiguity, and I will not translate you for anyone else.',
    region: 'london',
    yearsOfExperience: 12,
  },
  {
    displayName: 'Arjun Sethi',
    headline: 'Exploratory, reflective, unhurried',
    bio: 'I am interested in the stories people tell about themselves, and in what happens when two of those stories stop fitting each other. This is slow work and I like it that way.',
    region: 'london',
    yearsOfExperience: 9,
  },
  {
    displayName: 'Farah Haddad',
    headline: 'Structured, warm, grounded',
    bio: 'I work with people who want to understand something about themselves clearly enough to act on it. We will keep things concrete, and I will ask you to try things between sessions.',
    region: 'manchester',
    yearsOfExperience: 15,
  },
  {
    displayName: 'Morag Campbell',
    headline: 'Reflective, quiet, thorough',
    bio: 'I work slowly and carefully, usually with people who are dealing with loss in one form or another. I do not offer quick reassurance; I would rather we get to the actual thing.',
    region: 'edinburgh',
    yearsOfExperience: 21,
  },

  // ----------------------------------------------------------------- Europe
  {
    displayName: 'Lena Brandt',
    headline: 'Structured, direct, analytical',
    bio: 'I like to know what we are working on, in what order, and how we will know whether it is helping. That suits people who have been in vague therapy and found it unhelpful.',
    region: 'berlin',
    yearsOfExperience: 16,
  },
  {
    displayName: 'Tomas Nowak',
    headline: 'Integrative, calm, thorough',
    bio: 'I was trained in one tradition and have worked my way into others, and I choose between them depending on what you bring. I will tell you which one we are in.',
    region: 'warsaw',
    yearsOfExperience: 12,
  },
  {
    displayName: 'Sanne de Vries',
    headline: 'Exploratory, warm, curious',
    bio: 'I work with people who are trying to work out who they are, which is usually a longer question than it first appears. I do not rush towards an answer.',
    region: 'amsterdam',
    yearsOfExperience: 11,
  },
  {
    displayName: 'Yusuf Demir',
    headline: 'Direct, warm, grounded',
    bio: 'I work with people who are between countries, and with the families they left and the ones they made. I say what I see. People find that either clarifying or difficult, usually both.',
    region: 'berlin',
    yearsOfExperience: 14,
  },
  {
    displayName: 'Astrid Nilsson',
    headline: 'Gentle, reflective, patient',
    bio: 'I work with people who have moved recently and are finding that arrival is harder than leaving was. Sessions are quiet and unhurried, and I do not rush the adjustment.',
    region: 'gothenburg',
    yearsOfExperience: 9,
  },
  {
    displayName: 'Ines Ferreira',
    headline: 'Warm, exploratory, gentle',
    bio: 'I work with people who have arrived somewhere new and are still carrying the life they left. My sessions are conversational, and I make a lot of room for stories.',
    region: 'lisbon',
    yearsOfExperience: 10,
  },
  {
    displayName: 'Miguel Costa',
    headline: 'Exploratory, warm, solution-focused',
    bio: 'I am more interested in what is working than in what went wrong, though we usually end up at both. If you want practical movement, I can be fairly direct about it.',
    region: 'lisbon',
    yearsOfExperience: 7,
  },
  {
    displayName: 'Pieter van Dijk',
    headline: 'Integrative, thoughtful, steady',
    bio: 'I draw on several ways of thinking and let the session decide which one fits. Most of my work is with people working out who they are, and with the relationships that follow.',
    region: 'amsterdam',
    yearsOfExperience: 15,
  },

  // ------------------------------------------------------------- North America
  {
    displayName: 'Ruth Adeyemi',
    headline: 'Direct, warm, unflinching',
    bio: 'I say the thing in the room. That works for people who have spent a long time being careful, and less well for people who need a softer landing. Worth finding out which you are.',
    region: 'new-york',
    yearsOfExperience: 13,
  },
  {
    displayName: 'Aditi Raghunathan',
    headline: 'Warm, reflective, careful',
    bio: 'I work with people who are straddling two worlds and describing it as being confused. You are not confused. You are between things, which is different, and harder.',
    region: 'new-york',
    yearsOfExperience: 11,
  },
  {
    displayName: 'Chloe Baptiste',
    headline: 'Exploratory, warm, gentle',
    bio: 'I work with people who are burnt out from being good at things, and with the relationships that tend to go frayed alongside it. We will start slowly.',
    region: 'chicago',
    yearsOfExperience: 8,
  },
  {
    displayName: 'Samuel Ortiz',
    headline: 'Structured, reflective, patient',
    bio: 'I work with families: the expectations, the roles, the silences. My approach is unhurried and I will spend as long as the work needs on the first few sessions.',
    region: 'chicago',
    yearsOfExperience: 19,
  },
  {
    displayName: 'Maya Lindqvist',
    headline: 'Direct, exploratory, practical',
    bio: 'I work with people at the point of a decision, usually about work, and I do not think that is a small problem. I will push you a little, and I will expect you to push back.',
    region: 'austin',
    yearsOfExperience: 9,
  },
  {
    displayName: 'Jordan Okafor',
    headline: 'Solution-focused, warm, brief',
    bio: 'I work in short, concrete sessions and I will usually ask you to try something before we meet again. If you want years of talking, I am the wrong person and I will tell you.',
    region: 'austin',
    yearsOfExperience: 6,
  },
  {
    displayName: 'Weiyin Chen',
    headline: 'Exploratory, warm, curious',
    bio: 'I work with people who are working out what they actually want, as distinct from what they have been performing. That question gets more interesting the longer we look at it.',
    region: 'san-francisco',
    yearsOfExperience: 10,
  },
  {
    displayName: 'Priya Raghunathan-Bell',
    headline: 'Warm, integrative, steady',
    bio: 'I work with people who are between identities, and with the families and communities that have an opinion about it. I am comfortable holding more than one truth at once.',
    region: 'san-francisco',
    yearsOfExperience: 12,
  },
  {
    displayName: 'Hana Weiss',
    headline: 'Gentle, structured, careful',
    bio: 'I work with people who are grieving, and with people who are the ones holding everyone else together while they do. We will start wherever you actually are.',
    region: 'seattle',
    yearsOfExperience: 17,
  },
  {
    displayName: 'Irena Kowalczyk',
    headline: 'Reflective, warm, unhurried',
    bio: 'I work with people who have left somewhere familiar and are still living in the old version of their life. Sessions are quiet and unhurried, and I make room for a lot of thinking aloud.',
    region: 'warsaw',
    yearsOfExperience: 11,
  },
  {
    displayName: 'Elena Petrova',
    headline: 'Integrative, grounded, thorough',
    bio: 'I work with people who have arrived from somewhere else and are living in two time zones, in two languages, in two versions of their life. I take that seriously.',
    region: 'toronto',
    yearsOfExperience: 14,
  },
  {
    displayName: 'Amara Osei',
    headline: 'Warm, reflective, patient',
    bio: 'I work with people who are raising children across more than one culture, and with the friction that comes with it. My sessions are unhurried and quite long.',
    region: 'toronto',
    yearsOfExperience: 16,
  },

  // ------------------------------------------------------------ Rest of world
  {
    displayName: 'Omar Haddad',
    headline: 'Structured, integrative, practical',
    bio: 'I work with people who are managing a demanding job in a country that is not theirs, and with the strain that puts on everything else. Practical, and I keep an eye on whether it is working.',
    region: 'dubai',
    yearsOfExperience: 11,
  },
  {
    displayName: 'Leila Mansour',
    headline: 'Warm, reflective, careful',
    bio: 'I work with people who are holding two families in two places, and who have not been able to put that down for a while. I ask a lot about family, because it is usually in there.',
    region: 'dubai',
    yearsOfExperience: 13,
  },
  {
    displayName: 'Wei Ling Tan',
    headline: 'Structured, warm, methodical',
    bio: 'I work with people who are tired of drifting between contexts and want something more deliberate. We will set an agenda and, more importantly, keep to it.',
    region: 'singapore',
    yearsOfExperience: 9,
  },
  {
    displayName: 'Arun Prasad',
    headline: 'Warm, exploratory, gentle',
    bio: 'I work with people who moved countries as a child and have never quite settled anywhere, and with those who are about to. Arrival is harder than leaving, and I think about that a lot.',
    region: 'singapore',
    yearsOfExperience: 7,
  },
  {
    displayName: 'Helen Xu',
    headline: 'Gentle, reflective, patient',
    bio: 'I work with people who are between one life and another, and with the grief that comes when the old one is not finished with you. Slow, quiet, unhurried work.',
    region: 'melbourne',
    yearsOfExperience: 15,
  },
  {
    displayName: 'Rohan Chandran',
    headline: 'Exploratory, warm, grounded',
    bio: 'I work with people who have arrived in a new country and are trying to work out how to live there, which is less romantic than it sounds. I have done it myself.',
    region: 'melbourne',
    yearsOfExperience: 10,
  },
  {
    displayName: 'Aroha Williams',
    headline: 'Warm, reflective, gentle',
    bio: 'I work with people who are grieving, and with the long adjustment of starting over somewhere else. I am unhurried, and I do not treat arrival as a small thing.',
    region: 'auckland',
    yearsOfExperience: 18,
  },
  {
    displayName: 'Thabo Molefe',
    headline: 'Exploratory, warm, direct',
    bio: 'I work with people who are working out who they are, in a place that has not always made that easy. I am comfortable with not knowing, and I will not rush you into an answer.',
    region: 'cape-town',
    yearsOfExperience: 12,
  },
  {
    displayName: 'Ana Ribeiro',
    headline: 'Warm, direct, integrative',
    bio: 'I work with relationships, and with the family systems that sit behind them. I am practical rather than theoretical, and I will say when I think you are avoiding something.',
    region: 'sao-paulo',
    yearsOfExperience: 14,
  },
  {
    displayName: 'Lucia Ferreira',
    headline: 'Structured, warm, grounded',
    bio: 'I work with people who are making a big decision and cannot find their way through it, and with the relationships that get strained while they try. Clear, and reasonably brisk.',
    region: 'sao-paulo',
    yearsOfExperience: 8,
  },
  {
    displayName: 'Aditi Shah',
    headline: 'Warm, gentle, patient',
    bio: 'I work with people who have moved recently and are finding the first year harder than they expected, and with the family waiting at the other end. I take my time.',
    region: 'ahmedabad',
    yearsOfExperience: 11,
  },
] as const;
