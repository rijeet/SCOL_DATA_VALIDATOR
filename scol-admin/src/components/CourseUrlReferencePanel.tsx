import { useState } from 'react';
import { ExternalLink } from 'lucide-react';

type Props = {
  url: string;
};

export function CourseUrlReferencePanel({ url }: Props) {
  const [tryEmbed, setTryEmbed] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy course URL:', url);
    }
  }

  return (
    <aside
      className="flex min-h-0 w-1/2 flex-col border-l border-slate-200 bg-slate-50"
      aria-label="Course page reference"
    >
      <div className="shrink-0 space-y-2 border-b border-slate-200 bg-white p-3">
        <p className="text-sm font-bold text-slate-800">Course page</p>
        <p className="text-xs font-bold leading-snug text-slate-600">
          Most university sites (including BCU) block in-app preview for security.
          Use <strong>Open in browser</strong> to view the official page while you
          edit.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded bg-slate-900 px-3 py-1.5 text-sm font-bold text-white hover:bg-slate-800"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            Open in browser
          </a>
          <button
            type="button"
            onClick={() => void copyUrl()}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800"
          >
            {copied ? 'Copied' : 'Copy URL'}
          </button>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-600">
          <input
            type="checkbox"
            checked={tryEmbed}
            onChange={(e) => setTryEmbed(e.target.checked)}
            className="rounded"
          />
          Try embedded preview (may show “refused to connect”)
        </label>
        <p className="break-all text-xs font-medium text-sky-800 underline">
          {url}
        </p>
      </div>
      {tryEmbed ? (
        <iframe
          title="Course reference (embed)"
          src={url}
          className="min-h-0 flex-1 w-full bg-white"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
          <p className="max-w-sm text-sm font-bold text-slate-500">
            Preview is off. Open the course in your browser side-by-side with this
            window.
          </p>
        </div>
      )}
    </aside>
  );
}
