import { useCallback, useEffect, useState } from 'react';

function readLocation() {
  if (typeof window === 'undefined') {
    return { path: '/', search: '' };
  }
  return {
    path: window.location.pathname || '/',
    search: window.location.search || ''
  };
}

export function useRouter() {
  const [loc, setLoc] = useState(readLocation);

  useEffect(() => {
    const onPopState = () => setLoc(readLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    if (typeof window === 'undefined') return;
    if (replace) {
      window.history.replaceState({}, '', to);
    } else {
      window.history.pushState({}, '', to);
    }
    setLoc(readLocation());
  }, []);

  const query = new URLSearchParams(loc.search);

  return {
    path: loc.path,
    search: loc.search,
    query,
    navigate
  };
}
