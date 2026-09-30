import { ExternalLink } from 'lucide-react';

type Props = {
  url: string;
};

export function CourseUrlReferencePanel({ url }: Props) {
  return (
    <aside
      className="flex min-h-0 w-1/2 flex-col border-l border-slate-200 bg-slate-50"
      aria-label="Course page reference"
    >
      <div className="flex shrink-0 border-b border-slate-200 bg-white p-1.5">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-800 hover:bg-slate-50"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          New tab
        </a>
      </div>
      <iframe
        title="Course page"
        src={url}
        className="min-h-0 flex-1 w-full border-0 bg-white"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
    </aside>
  );
}
