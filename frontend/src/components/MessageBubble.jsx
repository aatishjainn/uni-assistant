import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Sparkles,
  Bot,
  User,
  Compass,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ShieldCheck,
  ArrowRight,
  ThumbsUp,
  ThumbsDown,
} from './Icons.jsx';

function AgentTrace({ trace }) {
  const [open, setOpen] = useState(false);
  const toolCalls = trace.reduce((n, t) => n + (t.calls?.length || 0), 0);

  return (
    <div className="mt-3 border-t border-slate-100 pt-2.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs font-medium text-indigo-700 hover:text-indigo-800 transition-colors select-none"
      >
        <span className="p-1 rounded-md bg-indigo-50 text-indigo-600">
          <Bot className="w-3.5 h-3.5" />
        </span>
        <span>
          Agent Execution Plan · {trace.length} {trace.length === 1 ? 'step' : 'steps'}, {toolCalls} {toolCalls === 1 ? 'tool call' : 'tool calls'}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-indigo-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-2.5 space-y-2 text-xs text-slate-600 pl-2 border-l-2 border-indigo-100">
          {trace.map((t) => (
            <div key={t.step} className="space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-[11px] uppercase tracking-wider">
                <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px]">
                  {t.step}
                </span>
                <span>Step {t.step}</span>
              </div>

              {t.thought && (
                <div className="text-slate-600 italic text-[11.5px] pl-5">
                  &ldquo;{t.thought}&rdquo;
                </div>
              )}

              {t.calls?.map((c, i) => (
                <div key={i} className="ml-5 rounded-lg bg-slate-50 border border-slate-200/80 p-2 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {c.ok ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      )}
                      <code className="font-mono text-[11px] font-medium text-slate-900 truncate">
                        {c.tool}({Object.keys(c.args || {}).length ? JSON.stringify(c.args) : ''})
                      </code>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                      {c.ms} ms
                    </span>
                  </div>
                  {c.summary && (
                    <div className="text-[11px] text-slate-500 pl-5 truncate">
                      {c.summary}
                    </div>
                  )}
                </div>
              ))}

              {t.repair && (
                <div className="ml-5 flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 p-2 text-[11px] text-amber-900">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span>
                    Self-Correction: Corrected figures ({t.repair.unsupported_numbers.join(', ')}) to adhere strictly to verified records.
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MessageBubble({
  role,
  text,
  sources = [],
  ui = null,
  trace = null,
  onMap,
  messageId = null,
  feedbackRating = null,
  onFeedback = null,
}) {
  const isUser = role === 'user';
  const [rating, setRating] = useState(feedbackRating);
  const [submitting, setSubmitting] = useState(false);
  const [thanked, setThanked] = useState(false);

  const vote = async (newRating) => {
    if (!messageId || submitting || !onFeedback) return;
    setSubmitting(true);
    try {
      await onFeedback(messageId, newRating);
      setRating(newRating);
      setThanked(true);
      setTimeout(() => setThanked(false), 2500);
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} group`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 shadow-2xs text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles className="w-4 h-4" />
        </div>
      )}

      <div
        className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 transition-all ${
          isUser
            ? 'bg-slate-900 text-white rounded-tr-xs shadow-xs text-sm leading-relaxed whitespace-pre-wrap'
            : 'bg-white border border-slate-200/80 shadow-2xs rounded-tl-xs text-slate-800'
        }`}
      >
        {isUser ? (
          <div>{text}</div>
        ) : (
          <div className="md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        )}

        {/* Citations Pill List */}
        {!isUser && sources.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-slate-100">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              <FileText className="w-3 h-3" />
              <span>Verified Sources</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {sources.map((s) => (
                <span
                  key={s.n}
                  title={`Exerpt from ${s.title}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-[11px] text-slate-700 font-medium transition-colors cursor-default"
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-slate-200 text-slate-800 text-[9px] flex items-center justify-center font-bold">
                    {s.n}
                  </span>
                  <span className="truncate max-w-[180px]">{s.title}</span>
                  {s.page && <span className="text-slate-400">p.{s.page}</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Agent Reasoning Trace */}
        {!isUser && trace?.length > 0 && <AgentTrace trace={trace} />}

        {/* Interactive Map Pill */}
        {!isUser && ui?.map && onMap && (
          <div className="mt-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onMap(ui.map)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-100 text-indigo-700 text-xs font-semibold px-3 py-1.5 transition-all shadow-2xs"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Open Campus Map Route</span>
              <ArrowRight className="w-3 h-3 text-indigo-500" />
            </button>
          </div>
        )}

        {/* Answer Feedback (Thumbs Up / Down) */}
        {!isUser && messageId && onFeedback && (
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
            <span className="text-[11px] text-slate-400">Was this answer helpful?</span>
            <div className="flex items-center gap-1">
              {thanked && <span className="text-[10px] text-emerald-600 font-medium mr-1">Feedback received!</span>}
              <button
                type="button"
                onClick={() => vote(5)}
                disabled={submitting}
                aria-label="Thumbs up"
                title="Good response"
                className={`p-1 rounded-md transition-all ${
                  rating === 5
                    ? 'bg-emerald-100 text-emerald-700 shadow-2xs font-semibold'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                <ThumbsUp className={`w-3.5 h-3.5 ${rating === 5 ? 'stroke-[2.2]' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => vote(1)}
                disabled={submitting}
                aria-label="Thumbs down"
                title="Poor response"
                className={`p-1 rounded-md transition-all ${
                  rating === 1
                    ? 'bg-rose-100 text-rose-700 shadow-2xs font-semibold'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                <ThumbsDown className={`w-3.5 h-3.5 ${rating === 1 ? 'stroke-[2.2]' : ''}`} />
              </button>
            </div>
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold">
          <User className="w-4 h-4" />
        </div>
      )}
    </div>
  );
}

export function TypingIndicator({ label = 'Assistant is typing' }) {
  return (
    <div className="flex gap-3 justify-start items-center">
      <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 shadow-2xs text-indigo-600 flex items-center justify-center shrink-0">
        <Sparkles className="w-4 h-4 animate-pulse" />
      </div>
      <div className="bg-white border border-slate-200/80 shadow-2xs rounded-2xl rounded-tl-xs px-4 py-2.5 flex items-center gap-2">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="dot w-1.5 h-1.5 rounded-full bg-indigo-600"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
    </div>
  );
}
