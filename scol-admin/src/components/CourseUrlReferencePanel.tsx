import { useEffect, useRef, useState } from 'react';
import { ExternalLink, PictureInPicture2 } from 'lucide-react';

const POPUP_NAME = 'scol-course-page';

type Props = {
  url: string;
};

function popupFeatures(width: number, height: number, left: number, top: number) {
  return [
    `popup=yes`,
    `width=${Math.round(width)}`,
    `height=${Math.round(height)}`,
    `left=${Math.round(left)}`,
    `top=${Math.round(top)}`,
    'menubar=no',
    'toolbar=yes',
    'location=yes',
    'status=no',
    'scrollbars=yes',
    'resizable=yes',
  ].join(',');
}

export function CourseUrlReferencePanel({ url }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<Window | null>(null);
  const [tryEmbed, setTryEmbed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);

  useEffect(() => {
    const popup = popupRef.current;
    if (!popup || popup.closed) return;
    try {
      popup.location.href = url;
      popup.focus();
    } catch {
      /* cross-origin after navigation — ignore */
    }
  }, [url]);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy course URL:', url);
    }
  }

  function openDockedPopup() {
    setPopupBlocked(false);
    const anchor = previewRef.current ?? panelRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const width = Math.max(420, rect.width);
    const height = Math.max(320, rect.height);
    const left = window.screenX + rect.left;
    const top = window.screenY + rect.top;

    const existing = popupRef.current;
    if (existing && !existing.closed) {
      try {
        existing.location.href = url;
        existing.focus();
        existing.resizeTo(width, height);
        existing.moveTo(left, top);
        return;
      } catch {
        existing.close();
      }
    }

    const popup = window.open(
      url,
      POPUP_NAME,
      popupFeatures(width, height, left, top),
    );
    if (!popup) {
      setPopupBlocked(true);
      return;
    }
    popupRef.current = popup;
    popup.focus();
  }

  return (
    <aside
      ref={panelRef}
      className="flex min-h-0 w-1/2 flex-col border-l border-slate-200 bg-slate-50"
      aria-label="Course page reference"
    >
      <div className="shrink-0 space-y-2 border-b border-slate-200 bg-white p-3">
        <p className="text-sm font-bold text-slate-800">Course page</p>
        <p className="text-xs font-bold leading-snug text-slate-600">
          University sites block in-page iframes. Use{' '}
          <strong>Open over preview area</strong> — a real browser window sized to
          this panel (works on Aston, BCU, etc.). Or open a full tab.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openDockedPopup}
            className="inline-flex items-center gap-1.5 rounded bg-slate-900 px-3 py-1.5 text-sm font-bold text-white hover:bg-slate-800"
          >
            <PictureInPicture2 className="h-4 w-4" aria-hidden />
            Open over preview area
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            New tab
          </a>
          <button
            type="button"
            onClick={() => void copyUrl()}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800"
          >
            {copied ? 'Copied' : 'Copy URL'}
          </button>
        </div>
        {popupBlocked && (
          <p className="text-xs font-bold text-amber-800">
            Popup blocked — allow popups for this site, then click again.
          </p>
        )}
        <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-600">
          <input
            type="checkbox"
            checked={tryEmbed}
            onChange={(e) => setTryEmbed(e.target.checked)}
            className="rounded"
          />
          Try iframe embed (usually blocked)
        </label>
        <p className="break-all text-xs font-medium text-sky-800 underline">
          {url}
        </p>
      </div>
      <div
        ref={previewRef}
        className="flex min-h-0 flex-1 flex-col bg-slate-100/80"
      >
        {tryEmbed ? (
          <iframe
            title="Course reference (embed)"
            src={url}
            className="min-h-0 flex-1 w-full bg-white"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="max-w-sm text-sm font-bold text-slate-600">
              Click <strong>Open over preview area</strong> to float a browser
              window on top of this zone (same size). Drag it if your OS moves it.
            </p>
            <button
              type="button"
              onClick={openDockedPopup}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Open over preview area
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
