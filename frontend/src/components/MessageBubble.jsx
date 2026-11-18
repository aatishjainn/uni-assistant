import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// "How I got this answer": the agent's plan, the tools it called and what came back
function AgentTrace({ trace }) {
  const toolCalls = trace.reduce((n, t) => n + (t.calls?.length || 0), 0);
  return (
    <details className="mt-2 text-xs text-slate-600">
      <summary className="cursor-pointer select-none font-medium text-indigo-700">
        🤖 How I got this answer ({trace.length} step{trace.length === 1 ? '' : 's'}, {toolCalls} tool call{toolCalls === 1 ? '' : 's'})
      </summary>
      <ol className="mt-2 space-y-2 list-decimal pl-4">
        {trace.map((t) => (
          <li key={t.step}>
            {t.thought && <div className="italic">{t.thought}</div>}
            {t.calls?.map((c, i) => (
              <div key={i} className="mt-1 rounded bg-slate-50 border border-slate-200 px-2 py-1">
                <span className={c.ok ? 'text-green-700' : 'text-red-700'}>{c.ok ? '✓' : '✗'}</span>{' '}
                <code>{c.tool}({Object.keys(c.args || {}).length ? JSON.stringify(c.args) : ''})</code>
                <span className="text-slate-400"> · {c.ms} ms</span>
                <div className="text-slate-500">{c.summary}</div>
              </div>
            ))}
            {t.repair && <div className="mt-1 text-amber-700">Checked my draft: numbers not found in the records ({t.repair.unsupported_numbers.join(', ')}), so I corrected it.</div>}
            {t.final && <div className="mt-1 text-slate-500">Wrote the final answer.</div>}
          </li>
        ))}
      </ol>
    </details>
  );
}

export default function MessageBubble({ role, text, sources = [], ui = null, trace = null, onMap }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-2.5 ${
        isUser ? 'bg-indigo-600 text-white whitespace-pre-wrap' : 'bg-white border border-slate-200 shadow-sm'}`}>
        {isUser ? text : (
          // react-markdown does not render raw HTML, so model output cannot inject scripts
          <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown></div>
        )}
        {!isUser && sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-200 text-xs text-slate-500">
            <span className="font-medium">Sources: </span>
            {sources.map((s) => (
              <span key={s.n} className="inline-block mr-2">[{s.n}] {s.title}{s.page ? ` (p. ${s.page})` : ''}</span>
            ))}
          </div>
        )}
        {!isUser && trace?.length > 0 && <AgentTrace trace={trace} />}
        {!isUser && ui?.map && onMap && (
          <button onClick={() => onMap(ui.map)} className="mt-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-medium px-3 py-1.5">
            🗺 Show on campus map
          </button>
        )}
      </div>
    </div>
  );
}

export function TypingIndicator({ label = 'Assistant is typing' }) {
  return (
    <div className="flex justify-start" aria-live="polite" aria-label={label}>
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl px-4 py-3 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="dot w-2 h-2 rounded-full bg-slate-400" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
        {label !== 'Assistant is typing' && <span className="ml-1 text-xs text-slate-500 self-center">{label}</span>}
      </div>
    </div>
  );
}
