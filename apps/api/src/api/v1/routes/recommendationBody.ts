import type { RecommendationBody } from '../../../data/matching/recommendationTypes.js';
import type { RecommendationResponse } from '../schemas/recommendation.js';

/**
 * The one place a recommendation becomes JSON.
 *
 * Both routes — the first match and the rematch — call this, which is what makes their
 * responses the same shape by construction rather than by two pieces of code that have
 * stayed in step so far. A field added here appears in both, and is caught by both
 * schemas' `additionalProperties: false` if one of them forgot to be updated.
 *
 * Nothing is derived here and nothing is decided. Every value comes from the service,
 * and the only work is flattening a therapist view into the `{ key, name }` pairs the
 * schema declares — a shape the client needs in order to link a profile, not an
 * opinion about one.
 */
export function toRecommendation(body: RecommendationBody): RecommendationResponse {
  const { therapist } = body;

  return {
    matchId: body.matchId,
    decidedAt: body.decidedAt,
    attempt: body.attempt,
    previousTherapistName: body.previousTherapistName,
    therapist: {
      id: therapist.id,
      displayName: therapist.displayName,
      headline: therapist.headline,
      bio: therapist.bio,
      location: therapist.location,
      timezone: therapist.timezone,
      yearsOfExperience: therapist.yearsOfExperience,
      languages: therapist.languages.map(attribute),
      areasOfWork: therapist.areasOfWork.map(attribute),
      communicationStyles: therapist.communicationStyles.map(attribute),
      approaches: therapist.approaches.map(attribute),
      contextualExperience: therapist.contextualExperience.map(attribute),
      sessionFormats: therapist.sessionFormats.map(attribute),
      availability: therapist.availability.map((window) => ({
        dayOfWeek: window.dayOfWeek,
        startMinute: window.startMinute,
        endMinute: window.endMinute,
      })),
    },
    whyThisMatch: body.evidence.map((item) => ({
      key: item.key,
      sentence: item.sentence,
      detail: item.detail,
    })),
    whatChanged: body.whatChanged.map((note) => ({
      category: note.category,
      sentence: note.sentence,
      detail: note.detail,
    })),
    adjustedFor: [...body.adjustedFor],
  };
}

function attribute(entry: { key: string; name: string }): { key: string; name: string } {
  return { key: entry.key, name: entry.name };
}
