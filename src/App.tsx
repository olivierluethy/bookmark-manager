import { ThemeToggle } from '@/components/ThemeToggle';

export function App() {
  return (
    <main className="min-h-dvh bg-bg text-text">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl">Bookmark</h1>
          <ThemeToggle />
        </div>
        <p className="mt-2 text-muted">Project scaffold is ready.</p>
      </div>
    </main>
  );
}
