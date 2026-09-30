import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '../lib/api';

const HELPERS = [
  { key: 'bd_entry', label: 'Bangladesh entry' },
  { key: 'deposit', label: 'Deposit' },
  { key: 'eng_req', label: 'English requirements' },
  { key: 'scholarship', label: 'Scholarships' },
] as const;

type Props = {
  universityKey: string;
  open: boolean;
  onClose: () => void;
};

export function UniversityHelpersPanel({ universityKey, open, onClose }: Props) {
  const [tab, setTab] = useState<string>(HELPERS[0].key);
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !universityKey) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<{ markdown: string }>(
      `/data-entry/universities/${encodeURIComponent(universityKey)}/helpers/${tab}`,
    )
      .then((res) => {
        if (cancelled) return;
        setMarkdown(res.markdown);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setMarkdown('');
        setError(e instanceof Error ? e.message : 'Could not load helper');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, universityKey, tab]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl"
      role="dialog"
      aria-label="University helpers"
    >
      <header className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <p className="text-sm font-bold text-slate-900">Cloudinary helpers</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-slate-600 hover:bg-slate-100"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="flex flex-wrap gap-1 border-b border-slate-100 px-2 py-1.5">
        {HELPERS.map((h) => (
          <button
            key={h.key}
            type="button"
            onClick={() => setTab(h.key)}
            className={`rounded px-2 py-0.5 text-xs font-bold ${
              tab === h.key
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            {h.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading && (
          <p className="text-sm font-bold text-slate-500">Loading…</p>
        )}
        {error && (
          <p className="text-sm font-bold text-red-600">{error}</p>
        )}
        {!loading && !error && (
          <pre className="whitespace-pre-wrap text-xs font-medium text-slate-800">
            {markdown || 'No content for this helper.'}
          </pre>
        )}
      </div>
    </div>
  );
}
