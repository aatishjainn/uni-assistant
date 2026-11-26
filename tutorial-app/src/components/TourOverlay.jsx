import { useEffect, useState } from 'react';
import { TUTORIAL_CHAPTERS, TUTORIAL_STEPS } from '../data/tutorialSteps.js';
import { PERSONAS } from '../data/mockData.js';
import {
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  RotateCcw,
  Minimize2,
  Maximize2,
  CheckCircle2,
  Play,
  X,
} from './Icons.jsx';

export function TutorialRibbon({
  stepIndex,
  visitedSteps,
  coachOpen,
  activeUser,
  onToggleCoach,
  onJumpToStep,
  onSwitchPersona,
  onRestart,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const step = TUTORIAL_STEPS[stepIndex];
  const chapter = TUTORIAL_CHAPTERS.find((c) => c.id === step.chapter);
  const progressPct = Math.round(((stepIndex + 1) / TUTORIAL_STEPS.length) * 100);

  return (
    <div className="h-11 bg-slate-900 text-white px-3 md:px-5 flex items-center justify-between gap-2 shrink-0 border-b border-slate-800 relative z-40">
      {/* Left: Mode badge & Chapter Drawer trigger */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-600 text-[11px] font-bold tracking-wide shrink-0">
          <Sparkles className="w-3 h-3" />
          <span className="hidden sm:inline">TUTORIAL MODE</span>
          <span className="sm:hidden">TOUR</span>
        </span>

        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors truncate cursor-pointer"
        >
          <ListChecks className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="truncate">
            Ch {chapter?.id}/{TUTORIAL_CHAPTERS.length}: {chapter?.title}
          </span>
          <span className="text-[10px] text-slate-400 font-mono shrink-0">
            ({stepIndex + 1}/{TUTORIAL_STEPS.length})
          </span>
        </button>
      </div>

      {/* Center: Mini Progress Bar */}
      <div className="hidden lg:flex items-center gap-2 w-44">
        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-slate-400">{progressPct}%</span>
      </div>

      {/* Right: Quick Role Switcher + Coach Toggle + Restart */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="hidden md:flex items-center gap-1 bg-slate-800/80 rounded-lg px-2 py-1 text-[11px]">
          <span className="text-slate-400">Role:</span>
          <select
            aria-label="Switch demo persona"
            value={activeUser?.email || ''}
            onChange={(e) => {
              const p = PERSONAS.find((x) => x.email === e.target.value);
              if (p) onSwitchPersona(p);
            }}
            className="bg-transparent text-indigo-300 font-semibold focus:outline-none cursor-pointer"
          >
            <option value="" className="bg-slate-900 text-slate-300">Signed Out</option>
            {PERSONAS.filter((p) => p.email !== 'student2@uni.test').map((p) => (
              <option key={p.email} value={p.email} className="bg-slate-900 text-white">
                {p.label} ({p.full_name.split(' ')[0]})
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={onRestart}
          title="Restart Tutorial from Step 1"
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onToggleCoach}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600/90 hover:bg-indigo-600 text-xs font-semibold text-white transition-colors cursor-pointer"
        >
          {coachOpen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{coachOpen ? 'Hide Guide' : 'Show Guide'}</span>
        </button>
      </div>

      {/* Chapters & Steps Map Dropdown */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-3 top-12 w-80 sm:w-96 max-h-[75vh] overflow-y-auto rounded-2xl bg-white text-slate-800 shadow-2xl border border-slate-200 p-3 z-50 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <div className="text-xs font-bold text-slate-900">Feature Walkthrough Index</div>
                <div className="text-[11px] text-slate-500">Jump directly to any feature module</div>
              </div>
              <button onClick={() => setMenuOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {TUTORIAL_CHAPTERS.map((ch) => {
              const stepsInCh = TUTORIAL_STEPS.map((s, idx) => ({ ...s, idx })).filter(
                (s) => s.chapter === ch.id
              );
              return (
                <div key={ch.id} className="space-y-1">
                  <div className="flex items-center justify-between px-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <span>
                      {ch.id}. {ch.title}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">
                      {ch.badge}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {stepsInCh.map((s) => {
                      const active = s.idx === stepIndex;
                      const done = visitedSteps.has(s.idx);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            onJumpToStep(s.idx);
                            setMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                            active
                              ? 'bg-indigo-50 text-indigo-700 font-semibold'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span className="truncate pr-2">
                            {s.idx + 1}. {s.title}
                          </span>
                          {done && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function TourCoachOverlay({
  stepIndex,
  coachOpen,
  onPrev,
  onNext,
  onHide,
  onRestart,
  onRunDemo,
}) {
  const step = TUTORIAL_STEPS[stepIndex];
  const chapter = TUTORIAL_CHAPTERS.find((c) => c.id === step.chapter);
  const [rect, setRect] = useState(null);
  const [dockTop, setDockTop] = useState(false);

  useEffect(() => {
    if (!coachOpen || !step.target) {
      setRect(null);
      return;
    }

    let timerId;
    const measure = () => {
      const el = document.querySelector(step.target);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) {
        setRect(null);
        return;
      }
      setRect({
        top: Math.max(46, r.top - 4),
        left: Math.max(4, r.left - 4),
        width: r.width + 8,
        height: r.height + 8,
      });

      // Avoid covering bottom-right elements with the coach card
      const inBottomRight = r.bottom > window.innerHeight - 230 && r.right > window.innerWidth - 420;
      setDockTop(inBottomRight);
    };

    const el = document.querySelector(step.target);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    timerId = setTimeout(measure, 120);
    const intervalId = setInterval(measure, 350);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    return () => {
      clearTimeout(timerId);
      clearInterval(intervalId);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [stepIndex, coachOpen, step.target]);

  if (!coachOpen) return null;

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TUTORIAL_STEPS.length - 1;

  return (
    <>
      {/* Non-blocking Spotlight Frame around the active feature element */}
      {rect && (
        <div
          aria-hidden="true"
          className="fixed z-30 rounded-2xl border-2 border-indigo-500 tour-spotlight pointer-events-none transition-all duration-300"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      )}

      {/* Subtle backdrop when no specific element is spotlighted (Welcome / Complete) */}
      {!rect && !step.target && (
        <div
          aria-hidden="true"
          className="fixed inset-0 top-11 bg-slate-950/35 backdrop-blur-[1px] z-30 pointer-events-none"
        />
      )}

      {/* Floating Coach Card */}
      <div
        role="dialog"
        aria-label="Tutorial step guide"
        className={`fixed z-50 right-4 md:right-6 w-[calc(100vw-2rem)] sm:w-[25rem] rounded-2xl bg-white border border-slate-200 shadow-2xl p-4 md:p-5 space-y-3 transition-all duration-200 ${
          !step.target
            ? 'top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 right-auto sm:w-[29rem]'
            : dockTop
            ? 'top-14'
            : 'bottom-4 md:bottom-6'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold uppercase tracking-wider">
              {chapter?.badge} · Step {stepIndex + 1}/{TUTORIAL_STEPS.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onHide}
            title="Minimize guide to explore freely"
            className="text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <h3 className="text-sm font-bold text-slate-900 leading-snug">{step.title}</h3>
          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">{step.description}</p>
        </div>

        {step.actionHint && (
          <div className="rounded-xl bg-indigo-50/70 border border-indigo-100 px-3 py-2 text-[11.5px] text-indigo-900 font-medium">
            💡 {step.actionHint}
          </div>
        )}

        {step.demoLabel && onRunDemo && (
          <button
            type="button"
            onClick={onRunDemo}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-semibold py-2 transition-colors cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{step.demoLabel}</span>
          </button>
        )}

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onPrev}
            disabled={isFirst}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>

          <div className="flex items-center gap-1.5">
            {isLast ? (
              <>
                <button
                  type="button"
                  onClick={onRestart}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restart</span>
                </button>
                <button
                  type="button"
                  onClick={onHide}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-xs cursor-pointer"
                >
                  <span>Explore Sandbox</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onNext}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
              >
                <span>{isFirst ? 'Start Tour' : 'Next'}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
