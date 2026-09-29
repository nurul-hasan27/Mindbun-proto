import { AiUnavailableError, type AiTurn } from './aiProvider.js';

/**
 * The line the assistant does not cross, checked before a provider is ever asked.
 *
 * ## Why a guard and not just an instruction
 *
 * Every provider takes a system instruction saying "you are not a therapist". That is a
 * request, and a request is not a control. This is a control: for a small, enumerable set of
 * asks — *do I have anxiety*, *what medication should I take*, *can you treat me* — the
 * assistant declines **without calling a model at all**.
 *
 * That is deliberately narrow. It matches the shape of a request for care rather than the
 * presence of a difficult topic, because a keyword list that fired on "therapy" would fire
 * on "I have never done therapy before" and shut down the conversation this exists to have.
 *
 * It is also honestly limited, and the limit is stated in the reply and in the docs: this is
 * a **redirect**, not a triage system. The product has no safety flow, and this does not
 * pretend to be one. Someone in crisis is given a pointer to real support and a clear end to
 * the conversation — not an assessment, and not a professional.
 */

/**
 * Requests for care, diagnosis, or treatment.
 *
 * Matched on a phrase rather than a bare keyword, so "I've been told I have anxiety" — a
 * person telling us their situation, which is exactly what we are here to hear — does not
 * trip it, while "do I have anxiety" does.
 *
 * ## Which way the errors go
 *
 * **A false positive here is a calm canned paragraph the person can read past and keep
 * typing.** It is slightly awkward and it costs nothing. **A false negative is the product
 * answering a medical question**, which is the one thing this whole file exists to prevent.
 *
 * So the patterns are loose on purpose, within the limit of not firing on ordinary
 * descriptions. The known cost: "I am not depressed, I am just tired" gets the redirect. It
 * is a bad sentence to write, it is not a bad outcome, and a tighter pattern would trade
 * that for a real hole.
 */
const CARE_REQUESTS: readonly RegExp[] = [
  /\b(?:do|does|did|should|could|would|can|am) (?:i|you) have\b/i,
  /\b(?:what|which) (?:medication|medicine|antidepressant|tablet|drug|pill)s?\b/i,
  /\b(?:diagnos(?:e|ing)|give me a diagnos|what diagnos|has a diagnos)\b/i,
  /\btreat me\b/i,
  /\bprescrib(?:e|ing)\b/i,
  /\b(?:am|are|is|was|were) (?:i|you) (?:depressed|anxious|bipolar|psychotic|mentally ill)\b/i,
  /\bcan you (?:be|act as|act like) (?:my|a) therapist\b/i,
  /\bwhat(?:'s| is) wrong with me\b/i,
  // "what therapy do I need" is the most direct form of the request this product must
  // refuse, and it is not phrased as a diagnosis question at all.
  /\b(?:what|which) (?:therapy|treatment|kind of therapy|type of therapy) (?:do|would|should)\b/i,
  /\bdo i need (?:therapy|treatment|a diagnosis)\b/i,
];

/**
 * Mentions of self-harm or suicide.
 *
 * Handled separately from the care requests, and differently. A request for a diagnosis is
 * answered with a redirect. A mention of self-harm is answered with a pointer to real
 * support and the end of the conversation, because the honest thing to do with the message
 * "I don't want to be here" is not to continue matching somebody to them.
 *
 * **This is not a risk assessment.** It does not evaluate level, history, intent, or
 * immediacy, and it is not a substitute for a clinician or a crisis line. It exists because
 * a product that reads this and replies with "let's find you a therapist" is doing harm,
 * and because the alternative — silence — is worse.
 */
const DISTRESS_MENTIONS: readonly RegExp[] = [
  /\b(?:kill|killing|harm|hurt|hurting|end|ending) (?:myself|my ?self|my life|my own life)\b/i,
  /\bsuicid(?:e|es|al|ing)\b/i,
  /\b(?:don'?t|do not|dont) want to (?:be here|live|exist|be alive)\b/i,
  /\bbetter off (?:dead|without me)\b/i,
  /\bno reason to (?:live|be here|go on)\b/i,
  // The passive phrasing, which is the one a person reaches for when they are describing
  // someone else's worry about them: "I've been worried I'd harm myself."
  /\bharm(?:ing)? my ?self\b/i,
];

/**
 * Where to send someone, in a form that works in every country the product might run in.
 *
 * International directories exist for exactly this and are not region-specific, which
 * matters: guessing a national number for a country we do not know would be worse than
 * pointing at the directory.
 */
const SUPPORT_DIRECTION =
  'If you are in immediate danger, please contact your local emergency number. ' +
  'FindAHead, Samaritans and Befriending helplines are listed at findahelpline.com.';

const CARE_REPLY =
  'I am here to help you describe what you are looking for, and to get that in front of a ' +
  'therapist. I cannot give therapy, diagnose anything, or say what you should take — that is ' +
  'not something an assistant should be doing, however well it knows the subject.\n\n' +
  'If you would like to talk to someone now, a GP or a counsellor can help you work out where to ' +
  'start. In the meantime, I can help you put into words what you are looking for. That is ' +
  'genuinely useful to bring to that first conversation.';

const DISTRESS_REPLY =
  'I am sorry. What you have just said matters more than anything else here, and it is not ' +
  'something I am able to help with.\n\n' +
  `${SUPPORT_DIRECTION}\n\n` +
  'A person is the right thing here, not an assistant. I will stop this conversation now.';

/** What a guard decided, and why. */
export type GuardOutcome =
  | { readonly kind: 'allow' }
  | { readonly kind: 'care-request'; readonly reply: string }
  | { readonly kind: 'distress'; readonly reply: string };

/**
 * Inspect one message the person wrote.
 *
 * Checks only the newest user message, because that is the one being answered, and because
 * a transcript that mentioned distress once an hour ago should not shut down the tenth turn.
 * The turn before it already dealt with it.
 */
export function inspectMessage(text: string): GuardOutcome {
  if (DISTRESS_MENTIONS.some((pattern) => pattern.test(text))) {
    return { kind: 'distress', reply: DISTRESS_REPLY };
  }

  if (CARE_REQUESTS.some((pattern) => pattern.test(text))) {
    return { kind: 'care-request', reply: CARE_REPLY };
  }

  return { kind: 'allow' };
}

/**
 * Apply the guard to a turn.
 *
 * Returns `null` when the conversation may continue, so a caller can write
 * `const guarded = guardTurn(...); if (guarded !== null) return guarded;` and read as the
 * single decision it is.
 *
 * The `AiUnavailableError('refused')` case is what tells the interface to end the
 * conversation rather than to offer a retry — there is nothing to retry.
 */
export function guardTurn(messages: readonly { role: string; text: string }[]): AiTurn | null {
  const newest = [...messages].reverse().find((message) => message.role === 'user');

  if (newest === undefined) {
    return null;
  }

  const outcome = inspectMessage(newest.text);

  if (outcome.kind === 'allow') {
    return null;
  }

  return {
    reply: outcome.reply,
    // Never summarisable: nothing about what to look for can be read out of this.
    readyToSummarise: false,
  };
}

/** Re-exported so a route can signal "end the conversation" without importing two modules. */
export { AiUnavailableError };
