import type { FastifyPluginCallback, FastifyReply } from 'fastify';
import { AiUnavailableError, type AiMessage, type AiProvider } from '../../../ai/aiProvider.js';
import { guardTurn } from '../../../ai/safety.js';
import { validateSignals, type IntakeVocabularyView } from '../../../ai/signalVocabulary.js';
import type { IntakeRepository } from '../../../data/intake/intakeRepository.js';
import { DataStoreUnavailableError } from '../../../data/storeErrors.js';
import {
  aiExtractRequestSchema,
  aiExtractResponseSchema,
  aiTurnRequestSchema,
  aiTurnResponseSchema,
  type AiExtractResponse,
  type AiTurnResponse,
} from '../schemas/ai.js';
import { errorResponseSchema, type ErrorResponse } from '../schemas/therapists.js';

/**
 * `POST /api/v1/ai/intake/turn` and `POST /api/v1/ai/intake/extract`.
 *
 * ## The two rules this file exists to hold
 *
 * **The AI is stateless.** The transcript arrives in the request and leaves with the
 * response. Nothing here writes, and there is no table for it — the conversation lives in
 * the browser's `sessionStorage` beside the intake draft, which is where the person's own
 * words already lived before this phase. A POST rather than a GET, so that nothing about
 * what someone typed can end up in a URL, a log line, or a `Referer`.
 *
 * **The AI cannot write to the product.** `extractSignals` returns a list of vocabulary keys
 * with a destination. The client applies them to the existing `IntakeDraft` with the existing
 * `toggle*` functions, on a page where the person can see and undo every one. There is no
 * endpoint here that stores anything, so "the AI filled in the intake" is not a thing that
 * can happen even if a provider were compromised.
 *
 * ## What is logged
 *
 * Nothing from the body. The request line carries a method and a path, the validation error
 * names a field rather than a value (verified — see the test that asserts it), and the two
 * error paths below log a code and a provider name. A person's own words appear in no log
 * line in this file.
 */

const TURN_DOCS = {
  tags: ['ai'],
  summary: 'One turn of the intake conversation',
  description:
    'Takes the transcript so far and what the intake already holds, and answers with the assistant’s next message. Stateless: nothing is stored. Where the assistant can see the intake, it is asked not to repeat a question that has already been answered.',
} as const;

const EXTRACT_DOCS = {
  tags: ['ai'],
  summary: 'Read the conversation as structured suggestions',
  description:
    'Returns vocabulary keys the conversation appears to imply, each with a confidence, a stated reason and the intake question it belongs to. Keys that are not in the vocabulary are rejected and reported, never guessed at. Nothing is stored; the client applies what the person keeps to the existing draft.',
} as const;

/** Long enough for a paragraph, short enough that a pasted document is refused. */
const MAX_MESSAGE_LENGTH = 4_000;

/**
 * A ceiling on the whole transcript.
 *
 * Two reasons. It is a denial-of-service guard on a request that costs money. And a person
 * who has written four thousand words is not going to read a summary of it — at that point
 * the intake form is the kinder thing to offer, and the interface says so.
 */
const MAX_TRANSCRIPT_LENGTH = 20_000;

const MAX_MESSAGES = 40;

function badRequest(message: string): ErrorResponse {
  return { statusCode: 400, error: 'Bad Request', message };
}

/**
 * The transcript, checked.
 *
 * Returns a discriminated result rather than throwing, so the route can answer with a
 * sentence. **The messages are not included in any error**, because the error goes into a
 * log line, and the log line is where a person's own words must not be.
 */
function readTranscript(raw: unknown): { ok: true; messages: readonly AiMessage[] } | { ok: false; message: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, message: 'The conversation could not be read.' };
  }

  if (raw.length > MAX_MESSAGES) {
    return { ok: false, message: 'That is a longer conversation than we can read in one go.' };
  }

  const messages: AiMessage[] = [];
  let total = 0;

  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      return { ok: false, message: 'The conversation could not be read.' };
    }

    const candidate = entry as Record<string, unknown>;
    const role = candidate['role'];
    const text = typeof candidate['text'] === 'string' ? candidate['text'].trim() : '';

    if ((role !== 'user' && role !== 'assistant') || text === '') {
      return { ok: false, message: 'The conversation could not be read.' };
    }

    if (text.length > MAX_MESSAGE_LENGTH) {
      return { ok: false, message: 'One of those messages is too long to read.' };
    }

    total += text.length;
    messages.push({ role, text });
  }

  if (total > MAX_TRANSCRIPT_LENGTH) {
    return { ok: false, message: 'There is a lot to read here. Try a shorter message.' };
  }

  return { ok: true, messages };
}

/** `known`, checked. Everything absent is a legitimate value, so this never fails. */
function readKnown(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

export interface AiRouteDeps {
  readonly ai: AiProvider;
  readonly intakes: IntakeRepository;
}

export function buildAiRoutes({ ai, intakes }: AiRouteDeps): FastifyPluginCallback {
  /**
   * The vocabulary, read per request.
   *
   * Not captured at start-up, and the reason is that a term renamed in the database must be
   * rejected without a restart. It is one indexed query on tables that are read on every
   * intake page anyway, so the cost is not worth the staleness.
   */
  async function vocabulary(): Promise<IntakeVocabularyView> {
    return await intakes.readVocabulary();
  }

  /** 503 when the assistant is switched off, 502 when it failed. Different sentences. */
  function failure(
    log: { warn: (payload: unknown, message?: string) => void; error: (payload: unknown, message?: string) => void },
    reply: FastifyReply,
    error: unknown,
  ): FastifyReply {
    if (error instanceof DataStoreUnavailableError) {
      log.error({ err: { name: error.name } }, 'ai store unavailable');
      return reply.status(503).send({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'We could not read the questions just now.',
      });
    }

    if (error instanceof AiUnavailableError) {
      // The reason code, never the message, and never anything the provider returned. A
      // provider's error body can echo the prompt, and the prompt is someone's own words.
      log.warn({ reason: error.name }, 'ai provider unavailable');
      return reply.status(502).send({
        statusCode: 502,
        error: 'Bad Gateway',
        message: 'Something went wrong while interpreting that. Your answers are still here.',
      });
    }

    log.error({ err: { name: error instanceof Error ? error.name : 'unknown' } }, 'ai route failure');
    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong.',
    });
  }

  return (app, _options, done) => {
    app.post(
      '/ai/intake/turn',
      {
        schema: {
          ...TURN_DOCS,
          body: aiTurnRequestSchema,
          response: {
            200: aiTurnResponseSchema,
            400: errorResponseSchema,
            502: errorResponseSchema,
            503: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        if (!ai.available) {
          return reply.status(503).send({
            statusCode: 503,
            error: 'Service Unavailable',
            message: 'The conversation assistant is switched off. The questions are still here.',
          });
        }

        const body = request.body as { messages?: unknown; known?: unknown };
        const transcript = readTranscript(body.messages);

        if (!transcript.ok) {
          return reply.status(400).send(badRequest(transcript.message));
        }

        // Checked before the provider is asked, and it can end the conversation. A request
        // for a diagnosis is answered without a model being involved at all, which is the
        // difference between a guard and a prompt. See `ai/safety.ts`.
        const guarded = guardTurn(transcript.messages);

        if (guarded !== null) {
          const response: AiTurnResponse = {
            reply: guarded.reply,
            readyToSummarise: guarded.readyToSummarise,
            provider: 'guard',
          };

          return reply.send(response);
        }

        try {
          const turn = await ai.nextTurn(transcript.messages, readKnown(body.known));
          const response: AiTurnResponse = {
            reply: turn.reply,
            readyToSummarise: turn.readyToSummarise,
            provider: ai.name,
          };

          return reply.send(response);
        } catch (error) {
          return failure(request.log, reply, error);
        }
      },
    );

    app.post(
      '/ai/intake/extract',
      {
        schema: {
          ...EXTRACT_DOCS,
          body: aiExtractRequestSchema,
          response: {
            200: aiExtractResponseSchema,
            400: errorResponseSchema,
            502: errorResponseSchema,
            503: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        if (!ai.available) {
          return reply.status(503).send({
            statusCode: 503,
            error: 'Service Unavailable',
            message: 'The conversation assistant is switched off. The questions are still here.',
          });
        }

        const body = request.body as { messages?: unknown };
        const transcript = readTranscript(body.messages);

        if (!transcript.ok) {
          return reply.status(400).send(badRequest(transcript.message));
        }

        if (transcript.messages.every((message) => message.role === 'assistant')) {
          return reply.status(400).send(
            badRequest('There is nothing to read yet — tell the assistant something first.'),
          );
        }

        const guarded = guardTurn(transcript.messages);

        if (guarded !== null) {
          // A refused turn produces no suggestions. Not an error: the conversation ended
          // cleanly, and answering with an empty list rather than a 400 is what lets the
          // interface show its own copy for that case.
          const response: AiExtractResponse = {
            signals: [],
            notUnderstood: [],
            surplus: [],
            provider: 'guard',
          };
          return reply.send(response);
        }

        try {
          // Whatever comes back, the vocabulary decides what survives. This is the single
          // place that judgement is made, for the mock and a real model alike.
          const raw = await ai.extractSignals(transcript.messages);
          const validated = validateSignals(raw, await vocabulary());
          const response: AiExtractResponse = {
            signals: validated.signals,
            notUnderstood: validated.notUnderstood,
            surplus: validated.surplus,
            provider: ai.name,
          };

          return reply.send(response);
        } catch (error) {
          return failure(request.log, reply, error);
        }
      },
    );

    done();
  };
}
