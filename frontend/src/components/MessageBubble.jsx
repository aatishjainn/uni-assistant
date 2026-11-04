import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function MessageBubble({ role, text }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-2.5 ${
        isUser ? 'bg-indigo-600 text-white whitespace-pre-wrap' : 'bg-white border border-slate-200 shadow-sm'}`}>
        {isUser ? text : (
          // react-markdown does not render raw HTML, so model output cannot inject scripts
          <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown></div>
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
