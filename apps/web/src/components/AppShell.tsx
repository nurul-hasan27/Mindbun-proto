import { Link, Outlet } from 'react-router-dom';

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-stone-50 text-stone-900">
      <header className="px-6 py-6 sm:px-10">
        <Link
          to="/"
          className="text-xs font-medium tracking-[0.2em] text-stone-500 uppercase transition-colors hover:text-stone-900"
        >
          Why This Match
        </Link>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10 sm:px-10 sm:py-16">
        <Outlet />
      </main>

      <footer className="px-6 py-8 sm:px-10">
        <p className="max-w-2xl text-xs leading-relaxed text-stone-500">
          Independent prototype. Not affiliated with any therapy provider. All content is synthetic
          demonstration data and nothing here provides clinical advice.
        </p>
      </footer>
    </div>
  );
}
