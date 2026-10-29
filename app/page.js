'use client';
import { useEffect, useRef, useState } from 'react';

const STALE_DAYS = 3;
const daysSince = (ts) => Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
const BLANK = { name: '', priority: 3, status: 'active', next_step: '' };

function ProjectForm({ form, setForm, onSave, onCancel, busy }) {
  return (
    <div className="row ok">
      <input
        className="fld"
        placeholder="Project name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <input
        className="fld"
        placeholder="Next step"
        value={form.next_step}
        onChange={(e) => setForm({ ...form, next_step: e.target.value })}
      />
      <div className="frow">
        <select className="fld" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Priority {n}</option>)}
        </select>
        <select className="fld" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="done">Done</option>
        </select>
      </div>
      <div className="frow">
        <button className="primary" disabled={busy || !form.name.trim()} onClick={onSave}>Save</button>
        <button className="ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function Page() {
  const [code, setCode] = useState('');
  const [input, setInput] = useState('');
  const [authed, setAuthed] = useState(false);
  const [state, setState] = useState(null);
  const [tab, setTab] = useState('chat');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | project id
  const [form, setForm] = useState(BLANK);
  const endRef = useRef(null);

  async function api(path, passcode, body, method) {
    const res = await fetch(path, {
      method: method || (body ? 'POST' : 'GET'),
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
    if (tab === 'chat') endRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  function startAdd() {
    setForm(BLANK);
    setEditing('new');
  }

  function startEdit(p) {
    setForm({ name: p.name, priority: p.priority, status: p.status, next_step: p.next_step || '' });
    setEditing(p.id);
  }

  async function saveProject() {
    setBusy(true);
    setError('');
    try {
      const data = editing === 'new'
        ? await api('/api/projects', code, form, 'POST')
        : await api('/api/projects', code, { ...form, id: editing }, 'PATCH');
      setState(data);
      setEditing(null);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  async function deleteProject(p) {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    setBusy(true);
    setError('');
    try {
      setState(await api('/api/projects', code, { id: p.id }, 'DELETE'));
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
          {error && <div className="err" style={{ padding: '0 0 8px' }}>{error}</div>}
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
            <div className="sechead">
              <h2>Projects</h2>
              {editing !== 'new' && <button className="primary small" onClick={startAdd}>+ Add project</button>}
            </div>
            {editing === 'new' && (
              <ProjectForm form={form} setForm={setForm} onSave={saveProject} onCancel={() => setEditing(null)} busy={busy} />
            )}
            {state.projects.map((p) => {
              if (editing === p.id) {
                return (
                  <ProjectForm key={p.id} form={form} setForm={setForm} onSave={saveProject} onCancel={() => setEditing(null)} busy={busy} />
                );
              }
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
                  <div className="frow" style={{ marginTop: 8 }}>
                    <button className="ghost" onClick={() => startEdit(p)}>Edit</button>
                    <button className="ghost danger" disabled={busy} onClick={() => deleteProject(p)}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
