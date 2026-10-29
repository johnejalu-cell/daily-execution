'use client';
import { useEffect, useRef, useState } from 'react';

const STALE_DAYS = 3;
const daysSince = (ts) => Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);

export default function Page() {
  const [code, setCode] = useState('');
  const [input, setInput] = useState('');
  const [authed, setAuthed] = useState(false);
  const [state, setState] = useState(null);
  const [tab, setTab] = useState('chat');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  async function api(path, passcode, body) {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { 'x-passcode': passcode, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  async function login(passcode) {
    try {
      setState(await api('/api/state', passcode));
      localStorage.setItem('coach_code', passcode);
      setCode(passcode);
      setAuthed(true);
      setError('');
    } catch {
      localStorage.removeItem('coach_code');
      setAuthed(false);
      setError('Wrong passcode.');
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem('coach_code');
    if (saved) login(saved);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state?.messages?.length, busy, tab]);

  async function send(text) {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    setInput('');
    setBusy(true);
    setError('');
    setState((s) => ({ ...s, messages: [...s.messages, { role: 'user', content: msg }] }));
    try {
      setState(await api('/api/chat', code, { message: msg }));
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  if (!authed) {
    return (
      <div className="center">
        <form className="card" onSubmit={(e) => { e.preventDefault(); login(input); setInput(''); }}>
          <h1 style={{ margin: 0, font: '700 20px Georgia, serif' }}>Daily Execution Coach</h1>
          <input type="password" placeholder="Passcode" value={input} onChange={(e) => setInput(e.target.value)} autoFocus />
          {error && <div className="err" style={{ padding: 0, marginBottom: 10 }}>{error}</div>}
          <button className="primary" style={{ width: '100%' }} type="submit">Sign in</button>
        </form>
      </div>
    );
  }

  const stale = state.projects.filter((p) => p.status === 'active' && daysSince(p.last_touched) >= STALE_DAYS);

  return (
    <div className="app">
      <div className="top">
        <h1>Daily Execution Coach</h1>
        <span className="day">{state.day}</span>
      </div>
      <div className="tabs">
        <button className={`tab ${tab === 'chat' ? 'on' : ''}`} onClick={() => setTab('chat')}>Coach</button>
        <button className={`tab ${tab === 'board' ? 'on' : ''}`} onClick={() => setTab('board')}>
          Board{stale.length ? ` (${stale.length} stale)` : ''}
        </button>
      </div>

      {tab === 'chat' ? (
        <>
          <div className="scroll">
            {state.messages.length === 0 && (
              <div className="empty">
                <p>No sessions yet. Start today's planning.</p>
                <button className="primary" onClick={() => send("Start my day. Review my projects and commitments and propose today's priorities.")}>
                  Start today's session
                </button>
              </div>
            )}
            {state.messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>{m.content}</div>
            ))}
            {busy && <div className="msg assistant dots"><span>●</span><span>●</span><span>●</span></div>}
            <div ref={endRef} />
          </div>
          {error && <div className="err">{error}</div>}
          <div className="composer">
            <textarea
              rows={1}
              placeholder="Report progress, change priorities, or ask for next steps"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 700) { e.preventDefault(); send(); } }}
            />
            <button className="send" disabled={busy || !input.trim()} onClick={() => send()}>Send</button>
          </div>
        </>
      ) : (
        <div className="scroll">
          <div className="sec">
            <h2>Today's plan</h2>
            {state.plan.length === 0 && <div className="sub">Not agreed yet. Start a session in Coach.</div>}
            {state.plan.map((item, i) => <div key={i} className="row ok">{item}</div>)}
          </div>
          <div className="sec">
            <h2>Open commitments</h2>
            {state.commitments.length === 0 && <div className="sub">None open.</div>}
            {state.commitments.map((c) => {
              const late = c.due_date && c.due_date < state.day;
              return (
                <div key={c.id} className={`row ${late ? 'late' : 'ok'}`}>
                  <b>{c.text}</b>
                  <div className="sub">
                    {c.due_date ? `Due ${c.due_date}` : 'No due date'}
                    {late && <span className="late-t"> Overdue</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="sec">
            <h2>Projects</h2>
            {state.projects.map((p) => {
              const d = daysSince(p.last_touched);
              const isStale = p.status === 'active' && d >= STALE_DAYS;
              return (
                <div key={p.id} className={`row ${isStale ? 'stale' : 'ok'}`}>
                  <b>{p.name}</b>
                  <div className="sub">
                    P{p.priority}, {p.status}, touched {d === 0 ? 'today' : `${d}d ago`}
                    {isStale && <span className="flag"> Stale</span>}
                  </div>
                  <div>{p.next_step || 'No next step set'}</div>
                </div>
              );
            })}
          </div>
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}
