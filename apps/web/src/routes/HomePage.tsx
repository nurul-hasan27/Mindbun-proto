import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <section className="space-y-8">
      <p className="text-xs font-medium tracking-[0.2em] text-stone-500 uppercase">
        Why this match
      </p>

      <div className="space-y-4">
        <h1 className="font-display text-3xl leading-tight text-stone-900 sm:text-4xl">
          Understand why we found this therapist for you.
        </h1>
        <p className="text-base leading-relaxed text-stone-600">
          We&rsquo;re exploring a more transparent approach to therapist matching &mdash; without
          turning therapy into therapist shopping.
        </p>
      </div>

      <div>
        <Link
          to="/start"
          className="inline-flex items-center rounded-md bg-stone-900 px-5 py-2.5 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-700 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Start
        </Link>
      </div>
    </section>
  );
}
