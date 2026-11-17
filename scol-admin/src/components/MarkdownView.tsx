function inlineHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

export function MarkdownView({ markdown }: { markdown: string }) {
  const blocks = markdown.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return (
    <div className="space-y-3 text-sm leading-6 text-slate-800">
      {blocks.map((block, i) => {
        const line = block.trim();
        if (!line) return null;
        if (line.startsWith('### ')) {
          return (
            <h3
              key={i}
              className="text-base font-bold text-slate-900"
              dangerouslySetInnerHTML={{ __html: inlineHtml(line.slice(4)) }}
            />
          );
        }
        if (line.startsWith('## ')) {
          return (
            <h2
              key={i}
              className="text-lg font-bold text-slate-900"
              dangerouslySetInnerHTML={{ __html: inlineHtml(line.slice(3)) }}
            />
          );
        }
        if (line.startsWith('# ')) {
          return (
            <h1
              key={i}
              className="text-xl font-bold text-slate-900"
              dangerouslySetInnerHTML={{ __html: inlineHtml(line.slice(2)) }}
            />
          );
        }
        if (line.split('\n').every((l) => l.trim().startsWith('- ') || l.trim().startsWith('* '))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {line.split('\n').map((item, j) => (
                <li
                  key={j}
                  dangerouslySetInnerHTML={{
                    __html: inlineHtml(item.trim().replace(/^[-*] /, '')),
                  }}
                />
              ))}
            </ul>
          );
        }
        return (
          <p
            key={i}
            className="whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: inlineHtml(line) }}
          />
        );
      })}
    </div>
  );
}
