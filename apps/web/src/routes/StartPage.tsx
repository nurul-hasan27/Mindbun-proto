import { Link } from 'react-router-dom';

export function StartPage() {
  return (
    <section className="space-y-6">
      <h1 className="font-display text-2xl leading-tight text-stone-900 sm:text-3xl">Start</h1>

      <p className="text-base leading-relaxed text-stone-600">
        This page is a placeholder for the guided intake flow. Nothing is collected or submitted
        yet &mdash; that arrives in a later phase.
      </p>

      <Link to="/" className="inline-block text-sm text-stone-500 underline hover:text-stone-900">
        Back to overview
      </Link>
    </section>
  );
}
