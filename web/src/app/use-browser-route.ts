import { useCallback, useEffect, useState } from 'react';
import { initialDestination, resolveRoute } from './routes';

export function useBrowserRoute(hasToken: boolean) {
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search);
  const navigate = useCallback((to: string, replace = false) => {
    if (!to.startsWith('/') || to.startsWith('//')) throw new Error('Only same-origin navigation is supported');
    const url = new URL(to, window.location.origin);
    const next = url.pathname + url.search + url.hash;
    if (replace) window.history.replaceState(null, '', next);
    else window.history.pushState(null, '', next);
    setLocation(next);
  }, []);
  useEffect(() => {
    const onPop = () => setLocation(window.location.pathname + window.location.search);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    const destination = initialDestination(window.location.pathname, hasToken);
    if (destination !== window.location.pathname) navigate(destination, true);
  }, [hasToken, navigate]);
  return {
    route: resolveRoute(new URL(location, window.location.origin).pathname),
    location,
    navigate,
  };
}
