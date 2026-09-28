import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router';

const ENTERANCE_KEYFRAMES: Keyframe[] = [
  { opacity: 0, transform: 'translate3d(0, 8px, 0)' },
  { opacity: 1, transform: 'translate3d(0, 0, 0)' },
];

const ENTERANCE_OPTIONS: KeyframeAnimationOptions = {
  duration: 420,
  easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
  fill: 'backwards',
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Plays the quiet route entrance without ever remounting the page.
 *
 * Phase 1 keyed `<main>` on the pathname, which threw away page state on every
 * navigation. This instead animates the existing element with the Web
 * Animations API: React's tree — and therefore any state inside a page — is left
 * completely alone.
 *
 * `fill: 'backwards'` applies the first keyframe only before the animation
 * starts, so there is no flash of the final state while the page settles.
 */
export function useRouteEntrance<TElement extends HTMLElement>(): RefObject<TElement | null> {
  const ref = useRef<TElement>(null);
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    const element = ref.current;

    if (element === null || typeof element.animate !== 'function' || prefersReducedMotion()) {
      return;
    }

    const animation = element.animate(ENTERANCE_KEYFRAMES, ENTERANCE_OPTIONS);

    return () => {
      animation.cancel();
    };
  }, [pathname]);

  return ref;
}
