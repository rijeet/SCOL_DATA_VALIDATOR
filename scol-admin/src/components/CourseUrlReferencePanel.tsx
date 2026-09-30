import { useEffect, useRef } from 'react';
import { ExternalLink, PictureInPicture2 } from 'lucide-react';

const POPUP_NAME = 'scol-course-page';

type Props = {
  url: string;
};

function tryOpenPopup(
  url: string,
  width: number,
  height: number,
  left: number,
  top: number,
): Window | null {
  const attempts = [
    `width=${Math.round(width)},height=${Math.round(height)},left=${Math.round(left)},top=${Math.round(top)},resizable=yes,scrollbars=yes`,
    `width=${Math.round(width)},height=${Math.round(height)}`,
    undefined,
  ] as const;

  for (const features of attempts) {
    const w = features
      ? window.open(url, POPUP_NAME, features)
      : window.open(url, POPUP_NAME);
    if (w) {
      try {
        w.resizeTo(width, height);
        w.moveTo(left, top);
      } catch {
        /* move/resize not allowed */
      }
      return w;
    }
  }
  return null;
}

export function CourseUrlReferencePanel({ url }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    const popup = popupRef.current;
    if (!popup || popup.closed) return;
    try {
      popup.location.href = url;
      popup.focus();
    } catch {
      /* cross-origin */
    }
  }, [url]);

  function openDockedPopup() {
    const anchor = iframeRef.current ?? panelRef.current;
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
        popupRef.current = null;
      }
    }

    let popup = tryOpenPopup(url, width, height, left, top);
    if (!popup) {
      popup = window.open(url, '_blank');
    }
    if (popup) {
      popupRef.current = popup;
      popup.focus();
    }
  }

  return (
    <aside
      ref={panelRef}
      className="flex min-h-0 w-1/2 flex-col border-l border-slate-200 bg-slate-50"
      aria-label="Course page reference"
    >
      <div className="flex shrink-0 flex-wrap gap-1 border-b border-slate-200 bg-white p-1.5">
        <button
          type="button"
          onClick={openDockedPopup}
          className="inline-flex items-center gap-1 rounded bg-slate-900 px-2 py-1 text-xs font-bold text-white hover:bg-slate-800"
        >
          <PictureInPicture2 className="h-3.5 w-3.5" aria-hidden />
          Open over preview area
        </button>
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
        ref={iframeRef}
        title="Course page"
        src={url}
        className="min-h-0 flex-1 w-full border-0 bg-white"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
    </aside>
  );
}
