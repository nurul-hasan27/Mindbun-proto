import {
  AiUnavailableError,
  type AiCaseContext,
  type AiCaseSummary,
  type AiKnownAnswers,
  type AiMessage,
  type AiProvider,
  type AiSignal,
  type AiTurn,
} from './aiProvider.js';
import type { ReadVocabulary } from './mockAiProvider.js';
import { OPEN_TO_GUIDANCE_KEY, type IntakeVocabularyView } from './signalVocabulary.js';

/**
 * A real provider, over the OpenAI-compatible chat completions HTTP shape.
 *
 * ## Why `fetch` and not a vendor SDK
 *
 * Three reasons, and the third is the one that decided it:
 *
 * 1. **No new dependency, and therefore no new supply chain and no new audit finding.** The
 *    API's production imports are `fastify`, `@fastify/cors`, `@prisma/client` and
 *    `@prisma/adapter-pg`. This adds none of them.
 * 2. **The endpoint is the configuration, not the code.** `AI_BASE_URL` points at OpenAI,
 *    a self-hosted vLLM, Ollama's compatible endpoint, or a gateway, and no line here
 *    changes. The model is whatever `AI_MODEL` names.
 * 3. **The tests never touch it.** Nothing in this file is called by a unit test, because
 *    every test injects a provider. The one thing worth testing here — that a malformed or
 *    oversized response is refused rather than rendered — is done through the validator and
 *    the grounding check, which both real and mock output go through.
 *
 * ## What it sends, and what it does not
 *
 * For the conversation, the person's own words and a flat list of the vocabulary names.
 * For a case, the structured context from `buildCaseContext` and nothing else: no intake
 * free text, no feedback free text, no matcher's note, no biography, no score, no name.
 *
 * The key is read from the environment here and never leaves the process. It is not in the
 * request context, not in a log line, and not in an error message — `AiUnavailableError`
 * carries a reason code and nothing else.
 */

export interface OpenAiCompatibleConfig {
  /** e.g. `https://api.openai.com/v1`. Any OpenAI-compatible base URL. */
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
  /** Hard ceiling on one request. The client also aborts; this bounds the promise. */
  readonly timeoutMs: number;
}

/** The most we will ever ask a model for, in tokens. A summary is not an essay. */
const MAX_COMPLETION_TOKENS = 400;

/** Turn the temperature down. A suggestion list is a place for a model to be inventive. */
const TEMPERATURE = 0.2;

const SYSTEM_INSTRUCTIONS = `You are the intake assistant inside a therapist-matching service called Mindbun.

You help someone describe what they are looking for in their own words, so that a human matcher can read it. You are not a therapist, a clinician, or a counsellor.

You must never:
- diagnose anything, name a condition, or suggest someone might have one
- offer treatment, a therapeutic technique, or advice about medication
- say what therapy someone "needs"
- promise or imply that a particular therapist will suit them
- claim you are a therapist, or that you are qualified to assess anyone

If someone asks for any of those, say plainly that you cannot help with that part, and offer instead to help them put into words what they are looking for. Do not be alarmed, and do not lecture.

If someone describes harming themselves or not wanting to be alive, do not continue the matching conversation. Say that what they have said matters more than anything else here, point them to local emergency services and findahelpline.com, and end.

Style:
- warm, plain, brief. Two or three sentences at most.
- never clinical, never bulleted, never enthusiastic or promotional
- no emoji, no markdown headings, no bold
- ask at most one question per reply
- never repeat a question whose answer is already in the conversation
- plain text only. Never output HTML or markdown.`;

/** Nudges the model toward the vocabulary, without ever naming a key it may not use. */
function vocabularyInstruction(vocabulary: IntakeVocabularyView): string {
  const families: readonly [string, readonly string[]][] = [
    ['areas of work', vocabulary.areasOfWork.map((entry) => entry.name)],
    ['conversation styles', vocabulary.communicationStyles.map((entry) => entry.name)],
    ['life context', vocabulary.contextualExperience.map((entry) => entry.name)],
    ['session formats', vocabulary.sessionFormats.map((entry) => entry.name)],
    ['languages', vocabulary.languages.map((entry) => entry.name)],
  ];

  const lines = families
    .filter(([, names]) => names.length > 0)
    .map(([family, names]) => `- ${family}: ${names.join(', ')}`);

  return `These are the only terms this service knows about. Suggest one only when what the person said genuinely points at it, and never invent a term that is not here:

${lines.join('\n')}`;
}

/** The known answers, as a sentence a model can use to avoid re-asking. */
function knownInstruction(known: AiKnownAnswers): string {
  const parts: string[] = [];

  if (known.areasOfWork !== undefined && known.areasOfWork.length > 0) {
    parts.push(`areas of work already chosen: ${known.areasOfWork.join(', ')}`);
  }

  if (known.communicationStyles !== undefined && known.communicationStyles.length > 0) {
    parts.push(`conversation style already chosen: ${known.communicationStyles.join(', ')}`);
  }

  if (known.contextualExperience !== undefined && known.contextualExperience.length > 0) {
    parts.push(`life context already chosen: ${known.contextualExperience.join(', ')}`);
  }

  if (known.languages !== undefined && known.languages.length > 0) {
    parts.push(`languages already chosen: ${known.languages.join(', ')}`);
  }

  if (known.sessionFormats !== undefined && known.sessionFormats.length > 0) {
    parts.push(`session formats already chosen: ${known.sessionFormats.join(', ')}`);
  }

  if (known.openToGuidance === true) {
    parts.push('they have already said they are not sure what they need');
  }

  if (known.hasAvailability === true) {
    parts.push('their availability has already been given');
  }

  if (parts.length === 0) {
    return 'Nothing has been answered yet.';
  }

  return `Already answered, so do not ask about these again — ${parts.join('; ')}.`;
}

const SIGNAL_EXTRACTION_INSTRUCTION = `Read everything the person has said and return what they appear to be looking for.

Return JSON only, in this shape:

{
  "signals": [
    {
      "category": "area" | "approach" | "communicationStyle" | "context" | "language" | "sessionFormat" | "availability" | "guidance",
      "key": "<a key from the terms above, or for availability 'hint:<morning|afternoon|evening|any>:<MONDAY-TUESDAY|any>', or for guidance 'open-to-guidance'>",
      "confidence": "low" | "medium" | "high",
      "source": "user_message",
      "explanation": "one sentence, addressed to the person, saying why"
    }
  ]
}

Rules:
- only keys from the lists above, never an invented term
- set confidence low when the person did not say it directly
- write the explanation in second person, as if speaking to them
- fewer, better suggestions. An empty list is a valid answer.
- "approach" and "communicationStyle" are the same question here: how they want to talk.`;

const CASE_INSTRUCTION = `You are helping a human matcher read a matching case. You are not the matcher and you do not decide anything.

You are given the client's needs, the engine's suggestion with its evidence, and a few other candidates with their evidence. Every sentence you write must be traceable to one of those fields. Do not calculate a score, do not rank the candidates, and do not mention anything that is not in the input.

Return JSON only:

{
  "summary": "two or three sentences on what the client appears to be looking for and how the current suggestion sits against it",
  "observations": ["up to 5 things worth reviewing, each traceable to a field"],
  "tradeoffs": ["up to 3 genuine tensions, or fewer if there are none"]
}

An empty tradeoff list is the honest answer most of the time. Do not invent a tension.`;

interface ChatResponse {
  readonly choices?: readonly {
    readonly message?: { readonly content?: string | null };
  }[];
}

/** One request. Throws `AiUnavailableError` for every failure a caller should handle. */
async function callModel(
  config: OpenAiCompatibleConfig,
  system: string,
  user: string,
  jsonMode: boolean,
): Promise<string> {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  // The key is captured into this closure and nowhere else. It is never logged, never
  // attached to the thrown error, and never included in a message sent back to a browser.
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, config.timeoutMs);

  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: TEMPERATURE,
        max_tokens: MAX_COMPLETION_TOKENS,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiUnavailableError('timeout');
    }

    throw new AiUnavailableError('network');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // The status is logged by the route; the body never is. A provider's error body can
    // echo the prompt, and the prompt is someone's own words.
    throw new AiUnavailableError('network');
  }

  let payload: ChatResponse;

  try {
    payload = (await response.json()) as ChatResponse;
  } catch {
    throw new AiUnavailableError('bad-response');
  }

  const content = payload.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || content.trim() === '') {
    throw new AiUnavailableError('bad-response');
  }

  return content;
}

/** Parse a model response as JSON, refusing anything that is not an object. */
function parseJson(raw: string): unknown {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AiUnavailableError('bad-response');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new AiUnavailableError('bad-response');
  }

  return parsed;
}

/** Cap a transcript before it is sent. See `MAX_TRANSCRIPT_CHARS` for why. */
const MAX_TRANSCRIPT_CHARS = 12_000;

/** What a category means, spelled out, because a wrong one is a dropped suggestion. */
const CATEGORY_RULES = `category meanings:
- area: what they want support with
- communicationStyle: the kind of conversation that would help them
- approach: the same question as communicationStyle, said as a named approach
- context: something about their background or situation that is relevant
- language: a language they would rather speak
- sessionFormat: online or in person
- availability: a rough time that might suit them
- guidance: they have said they are not sure what they need`;

/**
 * The transcript, oldest first, as one block of text.
 *
 * Turned into a single user message rather than a message array because a
 * `/chat/completions` endpoint pointed at a non-OpenAI host may not implement a
 * multi-turn conversation the way OpenAI does, and the transcript is the same either way.
 * The boundary between who said what is kept with a `Person:` / `Assistant:` prefix, which
 * is what the model needs to read it.
 */
function transcript(messages: readonly AiMessage[]): string {
  const rendered = messages
    .map((message) => `${message.role === 'user' ? 'Person' : 'Assistant'}: ${message.text}`)
    .join('\n\n');

  // From the end, so what was said last — and what is being answered — survives. Dropping
  // the opening rather than the newest is the only ordering that keeps the turn coherent.
  return rendered.length <= MAX_TRANSCRIPT_CHARS
    ? rendered
    : `…earlier in this conversation was left out…\n\n${rendered.slice(-MAX_TRANSCRIPT_CHARS)}`;
}

export function createOpenAiCompatibleProvider(
  config: OpenAiCompatibleConfig,
  readVocabulary: ReadVocabulary,
): AiProvider {
  /**
   * The system prompt, rebuilt per call.
   *
   * Because the vocabulary is read per call, the prompt that names the terms has to be too.
   * Rebuilding it is string concatenation over a few dozen words; caching it would be
   * caching a stale list of what the product is allowed to talk about, which is the one
   * thing this prompt must not be.
   */
  const base = async (): Promise<string> =>
    `${SYSTEM_INSTRUCTIONS}\n\n${vocabularyInstruction(await readVocabulary())}\n\n${CATEGORY_RULES}`;

  return {
    name: config.model,
    available: true,

    async nextTurn(messages: readonly AiMessage[], known: AiKnownAnswers): Promise<AiTurn> {
      if (messages.every((message) => message.role === 'assistant')) {
        return {
          reply: 'Tell me in your own words what has been going on.',
          readyToSummarise: false,
        };
      }

      const user = `${transcript(messages)}\n\n${knownInstruction(known)}\n\nReply with your next message only. No JSON.`;

      const reply = await callModel(config, await base(), user, false);

      return {
        // A model will occasionally wrap a reply in quotes or prefix it with a label. Strip
        // the shape of that, because the interface renders this as a paragraph of prose and
        // a stray "Assistant:" in the middle of one is a copy defect a human would have to
        // notice and fix.
        reply: reply.replace(/^\s*(assistant|reply)\s*:\s*/i, '').trim(),
        readyToSummarise: /\b(here is what i|here's what i|i have understood|does that sound right)\b/i.test(
          reply,
        ),
      };
    },

    async extractSignals(messages: readonly AiMessage[]): Promise<readonly AiSignal[]> {
      const vocabulary = await readVocabulary();
      const user = `${transcript(messages)}\n\n${SIGNAL_EXTRACTION_INSTRUCTION}\n\n${vocabularyInstruction(vocabulary)}`;

      const parsed = parseJson(await callModel(config, await base(), user, true)) as {
        readonly signals?: unknown;
      };

      // Not validated here. `validateSignals` in the route is the single place that decides
      // what is real, and having two validators would be a way for them to disagree.
      return Array.isArray(parsed.signals) ? (parsed.signals as readonly AiSignal[]) : [];
    },

    async summariseCase(context: AiCaseContext): Promise<AiCaseSummary> {
      const parsed = parseJson(
        await callModel(config, `${SYSTEM_INSTRUCTIONS}\n\n${CASE_INSTRUCTION}`, renderCase(context), true),
      ) as { readonly summary?: unknown; readonly observations?: unknown; readonly tradeoffs?: unknown };

      // The shape is checked here rather than trusted: a string where an array was asked
      // for would otherwise reach `.slice()` and throw a `TypeError` from inside a route.
      return {
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        observations: stringArray(parsed.observations),
        tradeoffs: stringArray(parsed.tradeoffs),
      };
    },
  };
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/**
 * The case, as a flat list of facts.
 *
 * Deliberately not JSON. A model reads a list of labelled lines about as well as it reads
 * JSON, and this form makes it obvious at a glance exactly which fields crossed the
 * boundary — which is the question a reviewer of this file should be able to answer.
 */
function renderCase(context: AiCaseContext): string {
  const lines: string[] = [];

  lines.push('WHAT THE CLIENT ASKED FOR');
  lines.push(
    context.needs.length === 0
      ? '(nothing recorded)'
      : context.needs.map((need) => `- ${need.category}: ${need.label}`).join('\n'),
  );
  lines.push(`They marked some of it as a requirement: ${context.hasRequirements ? 'yes' : 'no'}`);

  lines.push('');
  lines.push(`THE ENGINE'S SUGGESTION: ${context.suggestion.name}`);
  lines.push(
    context.suggestion.reasons.length === 0
      ? 'Evidence: (none recorded)'
      : `Evidence:\n${context.suggestion.reasons.map((reason) => `- ${reason}`).join('\n')}`,
  );
  lines.push(describeGaps('Terms they asked for that this candidate does not carry', context.suggestion.notOffered));

  lines.push('');
  lines.push('OTHER CANDIDATES THE ENGINE CONSIDERED');

  if (context.alternatives.length === 0) {
    lines.push('(none)');
  } else {
    for (const candidate of context.alternatives) {
      lines.push(`${candidate.name}:`);
      lines.push(
        candidate.reasons.length === 0
          ? '  Evidence: (none recorded)'
          : `  Evidence:\n${candidate.reasons.map((reason) => `  - ${reason}`).join('\n')}`,
      );
      lines.push(describeGaps('  Missing', candidate.notOffered));
    }
  }

  if (context.priorFeedback.length > 0) {
    lines.push('');
    lines.push('WHAT THEY SAID ABOUT AN EARLIER SEARCH');
    lines.push(context.priorFeedback.map((step) => `- ${step}`).join('\n'));
  }

  return lines.join('\n');
}

function describeGaps(
  label: string,
  gaps: readonly { category: string; names: readonly string[] }[],
): string {
  if (gaps.length === 0) {
    return `${label}: none`;
  }

  return `${label}:\n${gaps
    .map((gap) => `- ${gap.category}: ${gap.names.join(', ')}`)
    .join('\n')}`;
}

/** Re-exported so the route can validate the one key that is not a vocabulary key. */
export { OPEN_TO_GUIDANCE_KEY };
