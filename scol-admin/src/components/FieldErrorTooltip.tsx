import type { ReactNode } from 'react';
import { hintForField } from '../lib/fieldErrorHints';
import { isCourseRowFieldRequired } from '../lib/courseRowFieldValidation';

type Props = {
  fieldKey: string;
  message?: string;
  jsonError?: string | null;
  className?: string;
  required?: boolean;
  children: ReactNode;
};

/** Wraps a field control; error + hint appear in a small popover on hover/focus. */
export function FieldErrorTooltip({
  fieldKey,
  message,
  jsonError,
  className = '',
  required: requiredProp,
  children,
}: Props) {
  const primary = message?.trim() || (jsonError ? `JSON: ${jsonError}` : '');
  if (!primary) {
    return <>{children}</>;
  }
  const hint = hintForField(fieldKey);
  const required = requiredProp ?? isCourseRowFieldRequired(fieldKey);
  const tone = required
    ? { border: 'border-red-200', text: 'text-red-700', hintBorder: 'border-amber-100' }
    : { border: 'border-amber-200', text: 'text-amber-800', hintBorder: 'border-amber-100' };

  return (
    <div className={`group relative min-w-0 ${className}`}>
      {children}
      <div
        role="tooltip"
        className={`pointer-events-none absolute left-0 top-full z-[200] mt-0.5 hidden w-max max-w-[min(22rem,92vw)] rounded-md border ${tone.border} bg-white px-2 py-1.5 text-left shadow-lg group-focus-within:block group-hover:block`}
      >
        <p className={`text-xs font-bold leading-snug ${tone.text}`}>{primary}</p>
        {message && jsonError && (
          <p className="mt-0.5 text-xs font-bold leading-snug text-red-600">
            JSON: {jsonError}
          </p>
        )}
        {hint && (
          <p className={`mt-1 border-t ${tone.hintBorder} pt-1 text-xs font-bold leading-snug text-amber-950/90`}>
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
