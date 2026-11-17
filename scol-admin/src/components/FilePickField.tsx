import { useId, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';

type Props = {
  label: string;
  accept: string;
  file: File | null;
  onFile: (file: File | null) => void;
  cta: string;
  hint?: string;
};

export function FilePickField({
  label,
  accept,
  file,
  onFile,
  cta,
  hint,
}: Props) {
  const id = useId();
  const [dragOver, setDragOver] = useState(false);

  function takeFile(next: File | null) {
    onFile(next);
  }

  return (
    <div className="mt-3">
      <p className="text-sm font-bold text-slate-700">{label}</p>
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          takeFile(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`mt-2 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
          dragOver
            ? 'border-emerald-600 bg-emerald-50'
            : file
              ? 'border-emerald-300 bg-emerald-50/50'
              : 'border-slate-300 bg-slate-50 hover:border-slate-500 hover:bg-white'
        }`}
      >
        {file ? (
          <FileSpreadsheet className="h-6 w-6 text-emerald-700" aria-hidden />
        ) : (
          <Upload className="h-6 w-6 text-slate-500" aria-hidden />
        )}
        <span className="rounded bg-slate-900 px-4 py-2 text-sm font-bold text-white">
          {file ? 'Replace file' : cta}
        </span>
        <span className="max-w-full truncate text-sm font-bold text-slate-700">
          {file ? file.name : hint ?? 'CSV only'}
        </span>
        <input
          id={id}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => takeFile(e.target.files?.[0] ?? null)}
        />
      </label>
    </div>
  );
}
