import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function MessageBubble({ role, text, sources = [] }) {
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
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex justify-start" aria-live="polite" aria-label="Assistant is typing">
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl px-4 py-3 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="dot w-2 h-2 rounded-full bg-slate-400" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}
