import type { BatchKind } from '../lib/batches';

type Props = {
  value: BatchKind;
  onChange: (value: BatchKind) => void;
};

const OPTIONS: Array<{ value: BatchKind; label: string }> = [
  { value: 'UNIVERSITY', label: 'University' },
  { value: 'COURSE', label: 'Course' },
];

export function BatchTypeToggle({ value, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="University or course"
      className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1"
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`rounded-md px-4 py-1.5 text-sm font-bold ${
              active
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
