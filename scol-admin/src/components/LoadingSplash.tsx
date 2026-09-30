import { Loader2 } from 'lucide-react';

type LoadingSplashProps = {
  title: string;
  subtitle?: string;
};

/** Full-screen loader — unmount parent as soon as data is ready. */
export function LoadingSplash({ title, subtitle }: LoadingSplashProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-slate-100/95 px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2
        className="h-10 w-10 animate-spin text-slate-700"
        strokeWidth={2}
        aria-hidden
      />
      <h1 className="text-center text-sm font-bold text-slate-900">{title}</h1>
      {subtitle && (
        <p className="max-w-sm text-center text-sm font-bold text-slate-600">
          {subtitle}
        </p>
      )}
    </div>
  );
}
