import { useEffect, useId, useRef, useState, type FocusEvent } from 'react';
// import { Plus, Trash2 } from 'lucide-react';
import {
  blankMetaBlock,
  cleanMetaBlocks,
  parseMetaBlocks,
  serializeMetaBlocks,
  type MetaBlock,
} from '../lib/metaBlocks';

type Props = {
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  /** Row identity. Reloads the form when the same field is shown for another row. */
  resetKey?: string | number;
  className?: string;
};

function readValue(value: string): {
  mode: 'blocks' | 'raw';
  blocks: MetaBlock[];
  raw: string;
  error: string | null;
} {
  const parsed = parseMetaBlocks(value);
  if (parsed.ok) {
    return {
      mode: 'blocks',
      blocks: parsed.blocks.length ? parsed.blocks : [blankMetaBlock()],
      raw: value,
      error: null,
    };
  }
  return {
    mode: 'raw',
    blocks: [blankMetaBlock()],
    raw: value,
    error: parsed.error,
  };
}

export function MetaBlockEditor({
  value,
  onChange,
  onBlur,
  invalid = false,
  resetKey,
  className = '',
}: Props) {
  const initial = readValue(value);
  const [mode, setMode] = useState(initial.mode);
  const [blocks, setBlocks] = useState(initial.blocks);
  const [raw, setRaw] = useState(initial.raw);
  const [parseError, setParseError] = useState(initial.error);
  const emitted = useRef(value);
  const lastReset = useRef(resetKey);
  const modeRef = useRef(initial.mode);
  const blocksRef = useRef(initial.blocks);
  const rawRef = useRef(initial.raw);
  const baseId = useId();

  function showBlocks(next: MetaBlock[]) {
    blocksRef.current = next;
    setBlocks(next);
  }

  function showRaw(text: string) {
    rawRef.current = text;
    setRaw(text);
  }

  function showMode(next: 'blocks' | 'raw') {
    modeRef.current = next;
    setMode(next);
  }

  useEffect(() => {
    const resetChanged = lastReset.current !== resetKey;
    lastReset.current = resetKey;
    if (!resetChanged && value === emitted.current) return;
    emitted.current = value;
    const next = readValue(value);
    showMode(next.mode);
    showBlocks(next.blocks);
    showRaw(next.raw);
    setParseError(next.error);
  }, [resetKey, value]);

  function emit(next: string) {
    emitted.current = next;
    if (next !== value) onChange(next);
  }

  function updateBlock(index: number, patch: Partial<MetaBlock>) {
    const next = blocksRef.current.map((block, i) =>
      i === index ? { ...block, ...patch } : block,
    );
    showBlocks(next);
    emit(serializeMetaBlocks(next));
  }

  // function addBlock() {
  //   showBlocks([...blocksRef.current, blankMetaBlock()]);
  // }

  // function removeBlock(index: number) {
  //   const next = blocksRef.current.filter((_, i) => i !== index);
  //   const visible = next.length ? next : [blankMetaBlock()];
  //   showBlocks(visible);
  //   emit(serializeMetaBlocks(visible));
  // }

  function commitRaw(text: string) {
    const parsed = parseMetaBlocks(text);
    if (!parsed.ok) {
      setParseError(parsed.error);
      emit(text);
      return;
    }
    const serialized = serializeMetaBlocks(parsed.blocks);
    showMode('blocks');
    showBlocks(parsed.blocks.length ? parsed.blocks : [blankMetaBlock()]);
    setParseError(null);
    emit(serialized);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    if (modeRef.current === 'raw') {
      commitRaw(rawRef.current);
    } else {
      const current = blocksRef.current;
      const cleaned = cleanMetaBlocks(current);
      showBlocks(cleaned.length ? cleaned : [blankMetaBlock()]);
      emit(serializeMetaBlocks(current));
    }
    onBlur?.();
  }

  const border = invalid || parseError ? 'border-red-500' : 'border-slate-300';
  const fieldClass = `mt-1 w-full rounded border px-2 py-1.5 text-sm font-medium ${
    invalid || parseError
      ? 'border-red-500 bg-red-50 text-red-950'
      : 'border-slate-300'
  }`;

  return (
    <div
      className={`flex min-h-0 flex-col gap-3 ${className}`}
      onBlur={handleBlur}
    >
      {mode === 'raw' ? (
        <>
          {parseError ? (
            <p className="text-xs font-bold text-red-700">{parseError}</p>
          ) : null}
          <textarea
            value={raw}
            onChange={(e) => {
              const text = e.target.value;
              showRaw(text);
              const parsed = parseMetaBlocks(text);
              setParseError(parsed.ok ? null : parsed.error);
              emit(text);
            }}
            spellCheck={false}
            rows={8}
            aria-label="Metadata JSON"
            className={`min-h-24 w-full flex-1 rounded border px-2 py-2 font-mono text-xs font-medium leading-5 ${
              parseError
                ? 'border-red-500 bg-red-50 text-red-950'
                : 'border-slate-300'
            }`}
          />
        </>
      ) : (
        <>
          {blocks.map((block, index) => {
            const subtitleId = `${baseId}-subtitle-${index}`;
            const descriptionId = `${baseId}-description-${index}`;
            return (
              <div
                key={index}
                className={`rounded-lg border bg-white p-3 ${border}`}
              >
                {/* <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    aria-label="Remove block"
                    onClick={() => removeBlock(index)}
                    className="rounded border border-slate-300 p-1 text-slate-600 hover:bg-slate-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div> */}
                <label
                  htmlFor={subtitleId}
                  className="block text-sm font-bold text-slate-700"
                >
                  Subtitle
                  <input
                    id={subtitleId}
                    value={block.subtitle}
                    onChange={(e) =>
                      updateBlock(index, { subtitle: e.target.value })
                    }
                    className={fieldClass}
                  />
                </label>
                <label
                  htmlFor={descriptionId}
                  className="mt-3 block text-sm font-bold text-slate-700"
                >
                  Description (one line per paragraph)
                  <textarea
                    id={descriptionId}
                    value={block.description.join('\n')}
                    onChange={(e) =>
                      updateBlock(index, {
                        description: e.target.value.split('\n'),
                      })
                    }
                    rows={4}
                    className={`${fieldClass} min-h-20 resize-y leading-5`}
                  />
                </label>
              </div>
            );
          })}
          {/* <button
            type="button"
            onClick={addBlock}
            className="inline-flex w-fit items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add block
          </button> */}
        </>
      )}
    </div>
  );
}
