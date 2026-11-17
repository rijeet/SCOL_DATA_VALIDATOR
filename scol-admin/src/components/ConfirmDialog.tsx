import type { ReactNode } from 'react';

type Props = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  busyLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  busyLabel = 'Working…',
  cancelLabel = 'Cancel',
  tone = 'primary',
  busy = false,
  error,
  onCancel,
  onConfirm,
}: Props) {
  if (!open) return null;
  const confirmClass =
    tone === 'danger'
      ? 'bg-red-700 text-white hover:bg-red-800'
      : 'bg-emerald-700 text-white hover:bg-emerald-800';
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        aria-label="Dismiss"
        disabled={busy}
        onClick={() => {
          if (!busy) onCancel();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative z-[401] w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
      >
        <h2
          id="confirm-dialog-title"
          className="text-lg font-bold text-slate-900"
        >
          {title}
        </h2>
        <div className="mt-2 text-sm font-medium leading-6 text-slate-700">
          {children}
        </div>
        {error ? (
          <p className="mt-3 text-sm font-bold text-red-700">{error}</p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded border border-slate-300 px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`rounded px-3 py-2 text-sm font-bold disabled:opacity-50 ${confirmClass}`}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
