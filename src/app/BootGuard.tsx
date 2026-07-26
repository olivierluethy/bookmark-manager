import type { ReactNode } from 'react';
import { checkEnvironment } from '@/db/environment';

export function BootGuard({ children }: { children: ReactNode }) {
  const result = checkEnvironment();
  if (result.ok) return <>{children}</>;

  return (
    <div className="flex h-dvh items-center justify-center bg-bg p-8 text-text">
      <div className="max-w-lg rounded-[6px] border border-line bg-surface p-8">
        <h1 className="font-display text-2xl">This browser can't run the app</h1>
        <p className="mt-4 text-text">{result.reason}</p>
        <p className="mt-3 text-sm text-muted">{result.fix}</p>
        <p className="mt-6 border-t border-line pt-4 text-sm text-muted">
          Your bookmarks are stored locally in this browser. Rather than risk silently discarding
          them, the app stops here.
        </p>
      </div>
    </div>
  );
}
