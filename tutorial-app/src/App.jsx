import { useCallback, useEffect, useRef, useState } from 'react';
import { INITIAL_SESSIONS, PERSONAS, simulateChatResponse } from './data/mockData.js';
import { TUTORIAL_STEPS } from './data/tutorialSteps.js';
import TourCoachOverlay, { TutorialRibbon } from './components/TourOverlay.jsx';
import Login from './pages/Login.jsx';
import Chat from './pages/Chat.jsx';
import Campus from './pages/Campus.jsx';
import Hod from './pages/Hod.jsx';
import Admin from './pages/Admin.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('login'); // 'login' | 'chat' | 'campus' | 'hod' | 'admin'
  const [mapInit, setMapInit] = useState(null);
  const [hodTab, setHodTab] = useState('Overview');
  const [adminTab, setAdminTab] = useState('Users');

  // Chat state
  const [sessions, setSessions] = useState(INITIAL_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [mode, setMode] = useState('simple');
  const [agent, setAgent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoExpandTrace, setAutoExpandTrace] = useState(false);

  // Tutorial state
  const [stepIndex, setStepIndex] = useState(0);
  const [coachOpen, setCoachOpen] = useState(true);
  const [visitedSteps, setVisitedSteps] = useState(() => new Set([0]));

  const userRef = useRef(user);
  userRef.current = user;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const agentRef = useRef(agent);
  agentRef.current = agent;
  const demoTimerRef = useRef(null);

  const clearPendingDemo = () => {
    if (demoTimerRef.current) {
      clearTimeout(demoTimerRef.current);
      demoTimerRef.current = null;
    }
  };

  const sendSimulatedChat = useCallback((text, overrideOpts = {}) => {
    clearPendingDemo();
    const activeUser = overrideOpts.user || userRef.current || PERSONAS[0];
    const effectiveMode = overrideOpts.mode ?? modeRef.current;
    const effectiveAgent = overrideOpts.agent ?? agentRef.current;

    if (overrideOpts.mode) setMode(overrideOpts.mode);
    if (typeof overrideOpts.agent === 'boolean') setAgent(overrideOpts.agent);
    setAutoExpandTrace(Boolean(overrideOpts.expandTrace));

    const userMsg = { messageId: `u-${Date.now()}`, role: 'user', text };
    setMessages((prev) => (overrideOpts.resetMessages ? [userMsg] : [...prev, userMsg]));
    setLoading(true);

    demoTimerRef.current = setTimeout(() => {
      const reply = simulateChatResponse(text, activeUser, effectiveMode, effectiveAgent);
      const botMsg = {
        messageId: `a-${Date.now()}`,
        role: 'assistant',
        text: reply.answer,
        sources: reply.sources || [],
        ui: reply.ui || null,
        trace: reply.trace || null,
        blocked: Boolean(reply.blocked),
        feedbackRating: null,
      };
      setMessages((prev) => [...prev, botMsg]);
      setLoading(false);

      // Save to session list if new
      setActiveSessionId((sid) => {
        const nextId = sid || `sess-${Date.now()}`;
        setSessions((prevSess) => {
          const exists = prevSess.some((s) => s.id === nextId);
          if (exists) return prevSess;
          return [
            {
              id: nextId,
              session_title: text.slice(0, 34) + (text.length > 34 ? '…' : ''),
              messages: [
                { id: userMsg.messageId, sender: 'user', message: text },
                {
                  id: botMsg.messageId,
                  sender: 'assistant',
                  message: botMsg.text,
                  source_metadata: { sources: botMsg.sources, ui: botMsg.ui, trace: botMsg.trace },
                },
              ],
            },
            ...prevSess,
          ];
        });
        return nextId;
      });
    }, overrideOpts.instant ? 80 : 450);
  }, []);

  // Context passed to tutorial step hooks
  const buildTourContext = useCallback(() => {
    const findPersona = (email) => PERSONAS.find((p) => p.email === email) || PERSONAS[0];

    return {
      goToLogin: () => {
        clearPendingDemo();
        setLoading(false);
        setMapInit(null);
        setUser(null);
        setView('login');
      },
      enterChatAs: (email, opts = {}) => {
        clearPendingDemo();
        setLoading(false);
        const p = findPersona(email);
        setUser(p);
        setMapInit(null);
        setView('chat');
        if (typeof opts.agent === 'boolean') setAgent(opts.agent);
        if (opts.mode) setMode(opts.mode);
        if (opts.resetMessages) {
          setActiveSessionId(null);
          setMessages([]);
        }
        setAutoExpandTrace(Boolean(opts.expandTrace));
      },
      runDemoChat: (query, opts = {}) => {
        const p = findPersona(opts.email || 'student1@uni.test');
        if (!userRef.current || (opts.email && userRef.current.email !== p.email)) {
          setUser(p);
        }
        setMapInit(null);
        setView('chat');
        sendSimulatedChat(query, { ...opts, user: p });
      },
      ensureChatDemo: (query, opts = {}) => {
        const p = findPersona(opts.email || 'student1@uni.test');
        if (!userRef.current) setUser(p);
        setMapInit(null);
        setView('chat');
        if (typeof opts.agent === 'boolean') setAgent(opts.agent);
        if (opts.mode) setMode(opts.mode);
        setAutoExpandTrace(Boolean(opts.expandTrace));

        const alreadyShown = messagesRef.current.some(
          (m) => m.role === 'user' && m.text.toLowerCase() === query.toLowerCase()
        );
        if (!alreadyShown) {
          sendSimulatedChat(query, { ...opts, user: p, instant: true });
        }
      },
      openMapView: (params = {}) => {
        clearPendingDemo();
        setLoading(false);
        setMapInit({ ...params });
        setView('campus');
      },
      openHodView: (tab = 'Overview') => {
        clearPendingDemo();
        setLoading(false);
        setMapInit(null);
        setUser(findPersona('hod@uni.test'));
        setHodTab(tab);
        setView('hod');
      },
      openAdminView: (tab = 'Users') => {
        clearPendingDemo();
        setLoading(false);
        setMapInit(null);
        setUser(findPersona('admin@uni.test'));
        setAdminTab(tab);
        setView('admin');
      },
    };
  }, [sendSimulatedChat]);

  const goToStep = useCallback(
    (nextIndex) => {
      const clamped = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, nextIndex));
      setStepIndex(clamped);
      setVisitedSteps((prev) => {
        const next = new Set(prev);
        next.add(clamped);
        return next;
      });
      const step = TUTORIAL_STEPS[clamped];
      step.setup?.(buildTourContext());
    },
    [buildTourContext]
  );

  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (!coachOpen) return;
      if (e.key === 'ArrowRight') goToStep(stepIndex + 1);
      if (e.key === 'ArrowLeft') goToStep(stepIndex - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [coachOpen, goToStep, stepIndex]);

  const handleOpenSession = (id) => {
    const s = sessions.find((x) => x.id === id);
    if (!s) return;
    setActiveSessionId(id);
    setMessages(
      s.messages.map((m) => ({
        messageId: m.id,
        role: m.sender,
        text: m.message,
        sources: m.source_metadata?.sources || [],
        ui: m.source_metadata?.ui || null,
        trace: m.source_metadata?.trace || null,
        feedbackRating: m.feedback_rating || null,
      }))
    );
  };

  const handleDeleteSession = (id) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([]);
    }
  };

  const handleFeedback = (messageId, rating) => {
    setMessages((prev) =>
      prev.map((m) => (m.messageId === messageId ? { ...m, feedbackRating: rating } : m))
    );
  };

  const handleSwitchPersona = (persona) => {
    setUser(persona);
    setMapInit(null);
    setView('chat');
    setActiveSessionId(null);
    setMessages([]);
  };

  const handleOpenMap = (params = {}) => {
    setMapInit({ ...params });
    setView('campus');
  };

  const currentStep = TUTORIAL_STEPS[stepIndex];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50">
      <TutorialRibbon
        stepIndex={stepIndex}
        visitedSteps={visitedSteps}
        coachOpen={coachOpen}
        activeUser={user}
        onToggleCoach={() => setCoachOpen((o) => !o)}
        onJumpToStep={(idx) => {
          setCoachOpen(true);
          goToStep(idx);
        }}
        onSwitchPersona={handleSwitchPersona}
        onRestart={() => {
          setCoachOpen(true);
          setVisitedSteps(new Set([0]));
          goToStep(0);
        }}
      />

      <div className="flex-1 min-h-0 overflow-auto relative">
        {view === 'campus' && (
          <Campus
            initial={mapInit || {}}
            onBack={() => {
              setMapInit(null);
              setView(user ? 'chat' : 'login');
            }}
          />
        )}

        {view === 'login' && (
          <Login
            onLoggedIn={(u) => {
              setUser(u);
              setView('chat');
            }}
            onMap={() => handleOpenMap()}
          />
        )}

        {view === 'hod' && user?.role === 'hod' && (
          <Hod
            activeTab={hodTab}
            onTabChange={setHodTab}
            onBack={() => setView('chat')}
          />
        )}

        {view === 'admin' && user?.role === 'admin' && (
          <Admin
            activeTab={adminTab}
            onTabChange={setAdminTab}
            onBack={() => setView('chat')}
          />
        )}

        {view === 'chat' && user && (
          <Chat
            user={user}
            sessions={sessions}
            activeSessionId={activeSessionId}
            messages={messages}
            mode={mode}
            agent={agent}
            loading={loading}
            autoExpandTrace={autoExpandTrace}
            onSetMode={setMode}
            onSetAgent={setAgent}
            onNewChat={() => {
              setActiveSessionId(null);
              setMessages([]);
            }}
            onOpenSession={handleOpenSession}
            onDeleteSession={handleDeleteSession}
            onSendMessage={(msg) => sendSimulatedChat(msg)}
            onFeedback={handleFeedback}
            onLogout={() => {
              setUser(null);
              setView('login');
            }}
            onAdmin={() => setView('admin')}
            onHod={() => setView('hod')}
            onMap={handleOpenMap}
          />
        )}
      </div>

      <TourCoachOverlay
        stepIndex={stepIndex}
        coachOpen={coachOpen}
        onPrev={() => goToStep(stepIndex - 1)}
        onNext={() => goToStep(stepIndex + 1)}
        onHide={() => setCoachOpen(false)}
        onRestart={() => {
          setVisitedSteps(new Set([0]));
          goToStep(0);
        }}
        onRunDemo={
          currentStep.demoAction
            ? () => currentStep.demoAction(buildTourContext())
            : null
        }
      />
    </div>
  );
}
