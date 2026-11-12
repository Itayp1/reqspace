import { useEffect, useState } from 'react';

const read = () => (document.documentElement.classList.contains('dark') ? 'vs-dark' : 'light');

/** Monaco theme that follows the app's `dark` class on <html> live (P5.3). */
export function useMonacoTheme(): 'vs-dark' | 'light' {
  const [theme, setTheme] = useState<'vs-dark' | 'light'>(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    setTheme(read());
    return () => obs.disconnect();
  }, []);
  return theme;
}
