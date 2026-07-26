import { useEffect, useState } from 'react';
import {
  applyTheme,
  readStoredMode,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from '@/lib/theme';

const OPTIONS: readonly ThemeMode[] = ['light', 'system', 'dark'];

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() =>
    readStoredMode(localStorage.getItem(THEME_STORAGE_KEY)),
  );

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const sync = () => applyTheme(resolveTheme(mode, mq.matches), document.documentElement);
    sync();
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    // Only 'system' needs to react to OS changes, but subscribing always is simpler
    // and harmless.
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [mode]);

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="inline-flex gap-0.5 rounded-[6px] border border-line p-0.5"
    >
      {OPTIONS.map((option) => (
        <button
          key={option}
          role="radio"
          aria-checked={mode === option}
          onClick={() => setMode(option)}
          className={`rounded-[4px] px-2 py-1 text-xs capitalize transition-colors duration-150 ${
            mode === option ? 'bg-accent text-white' : 'text-muted hover:text-text'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
