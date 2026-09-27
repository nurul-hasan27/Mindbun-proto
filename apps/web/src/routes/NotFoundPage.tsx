import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="space-y-6">
      <h1 className="font-display text-2xl leading-tight text-stone-900 sm:text-3xl">
        Page not found
      </h1>
      <p className="text-base leading-relaxed text-stone-600">
        The page you were looking for doesn&rsquo;t exist.
      </p>
      <Link to="/" className="inline-block text-sm text-stone-500 underline hover:text-stone-900">
        Back to overview
      </Link>
    </section>
  );
}
