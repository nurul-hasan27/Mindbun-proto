import { useEffect } from 'react';

interface PageMeta {
  readonly title: string;
  readonly description?: string;
}

const TITLE_SUFFIX = 'Why This Match';

/**
 * Keeps the document title and meta description in step with the visible route.
 * Small, but it matters for a product people arrive at from a shared link.
 */
export function usePageMeta({ title, description }: PageMeta): void {
  useEffect(() => {
    document.title = title === TITLE_SUFFIX ? title : `${title} · ${TITLE_SUFFIX}`;

    if (description === undefined) {
      return;
    }

    const meta = document.querySelector('meta[name="description"]');
    meta?.setAttribute('content', description);
  }, [title, description]);
}
