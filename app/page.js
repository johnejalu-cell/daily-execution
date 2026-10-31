'use client';
import { useEffect, useRef, useState } from 'react';

const STALE_DAYS = 3;
const daysSince = (ts) => Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
const BLANK = { name: '', priority: 3, status: 'active', next_step: '', objective: '', success_measure: '', deadline: '', constraints: '', people: '' };
const START = "Start my day. Review my projects, steps and commitments, carry forward unfinished items from my last plan, and propose today's priorities.";
const REPLAN = "Re-plan my day. Check what is done and what has changed since the current plan was made, then propose an updated list for today to replace it.";
const MAX_BYTES = 3000000;
const toB64 = (f) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = () => rej(new Error('Could not read file'));
  r.readAsDataURL(f);
});
const dayOf = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Africa/Kampala' });

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
      <textarea
        className="fld"
        placeholder="Goal: what is this project meant to achieve?"
        value={form.objective}
        onChange={(e) => setForm({ ...form, objective: e.target.value })}
      />
      <input
        className="fld"
        placeholder="Success measure (how you will know it worked)"
        value={form.success_measure}
        onChange={(e) => setForm({ ...form, success_measure: e.target.value })}
      />
      <label className="lbl" style={{ display: 'block', marginBottom: 8 }}>Deadline
        <input type="date" className="fld" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
      </label>
      <textarea
        className="fld"
        placeholder="Constraints: budget, dependencies, risks"
        value={form.constraints}
        onChange={(e) => setForm({ ...form, constraints: e.target.value })}
      />
      <input
        className="fld"
        placeholder="People: partners, decision makers, team"
        value={form.people}
        onChange={(e) => setForm({ ...form, people: e.target.value })}
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

const DW = 26;
const dn = (d) => Math.floor(Date.parse(d + 'T00:00:00Z') / 86400000);
const fmt = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const short = (n) =>
  new Date(n * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function TaskForm({ form, setForm, onSave, onDelete, onCancel, busy, projectName }) {
  return (
    <div className="row ok" style={{ marginBottom: 12 }}>
      <div className="sub" style={{ marginBottom: 6 }}>{projectName}</div>
      <input
        className="fld"
        placeholder="Step title"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
      />
      <div className="frow">
        <label className="lbl">Start
          <input type="date" className="fld" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
        </label>
        <label className="lbl">End
          <input type="date" className="fld" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
        </label>
      </div>
      <div className="frow" style={{ marginTop: 8 }}>
        <select className="fld" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option value="todo">To do</option>
          <option value="doing">Doing</option>
          <option value="done">Done</option>
        </select>
        <select className="fld" value={form.progress} onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })}>
          {[0, 25, 50, 75, 100].map((n) => <option key={n} value={n}>{n}% done</option>)}
        </select>
      </div>
      <div className="frow" style={{ marginTop: 8 }}>
        <button className="primary" disabled={busy || !form.title.trim()} onClick={onSave}>Save</button>
        {onDelete && <button className="ghost danger" disabled={busy} onClick={onDelete}>Delete</button>}
        <button className="ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function Gantt({ projects, tasks, today, onAdd, onEdit }) {
  const t0 = dn(today);
  const shown = tasks.filter((t) => projects.some((p) => p.id === t.project_id));
  let min = t0 - 1;
  let max = t0 + 20;
  shown.forEach((t) => {
    min = Math.min(min, dn(t.start_date) - 1);
    max = Math.max(max, dn(t.end_date) + 3);
  });
  const n = max - min + 1;
  const grid = {
    width: n * DW,
    backgroundImage: `repeating-linear-gradient(to right, var(--line) 0, var(--line) 1px, transparent 1px, transparent ${DW * 7}px)`,
  };

  return (
    <div className="gscroll">
      <div className="ginner" style={grid}>
        <div className="ghead">
          {Array.from({ length: Math.ceil(n / 7) }, (_, i) => (
            <span key={i} style={{ left: i * 7 * DW + 3 }}>{short(min + i * 7)}</span>
          ))}
        </div>
        <div className="gtoday" style={{ left: (t0 - min) * DW + DW / 2 }} />
        {projects.map((p) => {
          const pt = tasks.filter((t) => t.project_id === p.id);
          return (
            <div key={p.id} className="gproj">
              <div className="gsticky gpname">
                <b>{p.name}</b>
                <button className="ghost small" onClick={() => onAdd(p)}>+ Step</button>
              </div>
              {pt.length === 0 && <div className="gsticky sub" style={{ padding: '4px 0 8px' }}>No steps yet</div>}
              {pt.map((t) => {
                const s = dn(t.start_date);
                const e = dn(t.end_date);
                const late = t.status !== 'done' && e < t0;
                return (
                  <div
                    key={t.id}
                    className="grow"
                    role="button"
                    tabIndex={0}
                    onClick={() => onEdit(t)}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') onEdit(t); }}
                  >
                    <div className="gsticky glabel">
                      {t.title}{' '}
                      <span className="sub">{short(s)} to {short(e)}{late && <span className="late-t"> Late</span>}</span>
                    </div>
                    <div className={`gbar ${t.status} ${late ? 'late' : ''}`} style={{ left: (s - min) * DW, width: (e - s + 1) * DW }}>
                      <div className="gfill" style={{ width: `${t.progress}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
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
  const [view, setView] = useState('overview'); // overview | gantt
  const [taskForm, setTaskForm] = useState(null);
  const [files, setFiles] = useState([]);
  const fileRef = useRef(null);
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
    const attached = text === undefined ? files : [];
    let msg = (text ?? input).trim();
    if (!msg && attached.length) msg = 'Review the attached file(s) and build a comprehensive execution plan.';
    if (!msg || busy) return;
    setInput('');
    if (attached.length) setFiles([]);
    setBusy(true);
    setError('');
    const label = attached.length ? `${msg}\n[Attached: ${attached.map((f) => f.name).join(', ')}]` : msg;
    setState((s) => ({ ...s, messages: [...s.messages, { role: 'user', content: label }] }));
    try {
      const payload = attached.map(({ name, media_type, data }) => ({ name, media_type, data }));
      setState(await api('/api/chat', code, { message: msg, attachments: payload }));
    } catch (e) {
      setError(e.message);
      if (attached.length) setFiles(attached);
    }
    setBusy(false);
  }

  function startAdd() {
    setForm(BLANK);
    setEditing('new');
  }

  function startEdit(p) {
    setForm({
      name: p.name, priority: p.priority, status: p.status, next_step: p.next_step || '',
      objective: p.objective || '', success_measure: p.success_measure || '', deadline: p.deadline || '',
      constraints: p.constraints || '', people: p.people || '',
    });
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

  function openAddTask(p) {
    setTaskForm({
      id: null, project_id: p.id, title: '',
      start_date: state.day, end_date: fmt(dn(state.day) + 6), status: 'todo', progress: 0,
    });
  }

  function openEditTask(t) {
    setTaskForm({
      id: t.id, project_id: t.project_id, title: t.title,
      start_date: t.start_date, end_date: t.end_date, status: t.status, progress: t.progress,
    });
  }

  async function saveTask() {
    if (taskForm.end_date < taskForm.start_date) {
      setError('End date is before start date.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = taskForm.id
        ? await api('/api/tasks', code, taskForm, 'PATCH')
        : await api('/api/tasks', code, taskForm, 'POST');
      setState(data);
      setTaskForm(null);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  async function deleteTask() {
    if (!window.confirm('Delete this step?')) return;
    setBusy(true);
    setError('');
    try {
      setState(await api('/api/tasks', code, { id: taskForm.id }, 'DELETE'));
      setTaskForm(null);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  function signOut() {
    localStorage.removeItem('coach_code');
    setAuthed(false);
    setState(null);
    setCode('');
    setInput('');
    setError('');
    setTab('chat');
    setEditing(null);
    setTaskForm(null);
    setFiles([]);
  }

  async function onPick(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    const OK = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    let total = files.reduce((n, f) => n + f.size, 0);
    const next = [];
    for (const f of picked) {
      if (!OK.includes(f.type)) {
        setError(`${f.name}: only PDF and image files are supported.`);
        continue;
      }
      total += f.size;
      if (total > MAX_BYTES) {
        setError('Attachments must total under 3 MB. Compress the PDF or attach fewer pages.');
        return;
      }
      try {
        next.push({ name: f.name, media_type: f.type, size: f.size, data: await toB64(f) });
      } catch (err) {
        setError(err.message);
      }
    }
    if (next.length) {
      setFiles((cur) => [...cur, ...next]);
      setError('');
    }
  }

  async function deleteDoc(d) {
    if (!window.confirm(`Delete the saved summary of "${d.name}"?`)) return;
    setBusy(true);
    setError('');
    try {
      setState(await api('/api/documents', code, { id: d.id }, 'DELETE'));
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

  const hasToday = state.messages.some((m) => m.created_at && dayOf(m.created_at) === state.day);
  const stale = state.projects.filter((p) => p.status === 'active' && daysSince(p.last_touched) >= STALE_DAYS);

  return (
    <div className="app">
      <div className="top">
        <h1>Daily Execution Coach</h1>
        <div className="hdr">
          <span className="day">{state.day}</span>
          <button className="ghost small" onClick={signOut}>Sign out</button>
        </div>
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
              <div className="empty"><p>No sessions yet.</p></div>
            )}
            {state.messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>{m.content}</div>
            ))}
            {busy && <div className="msg assistant dots"><span>●</span><span>●</span><span>●</span></div>}
            {!hasToday && !busy && (
              <div className="startcard">
                <b>New day, new plan</b>
                <div className="sub">
                  The coach reviews your projects, steps and unfinished items, then proposes today's priorities for your approval.
                </div>
                <button className="primary" onClick={() => send(START)}>Start today's session</button>
              </div>
            )}
            <div ref={endRef} />
          </div>
          {error && <div className="err">{error}</div>}
          {(files.length > 0 || (hasToday && !busy)) && (
            <div className="chips">
              {files.length === 0 && (
                <button className="ghost small" onClick={() => send(REPLAN)}>Re-plan today</button>
              )}
              {files.map((f, i) => (
                <span key={i} className="chip">
                  {f.name}
                  <button className="x" aria-label="Remove file" onClick={() => setFiles(files.filter((_, j) => j !== i))}>×</button>
                </span>
              ))}
            </div>
          )}
          <div className="composer">
            <input
              ref={fileRef}
              type="file"
              hidden
              multiple
              accept="application/pdf,image/png,image/jpeg,image/gif,image/webp"
              onChange={onPick}
            />
            <button className="ghost" disabled={busy} onClick={() => fileRef.current?.click()} aria-label="Attach a file">Attach</button>
            <textarea
              rows={1}
              placeholder="Report progress, or attach a business plan or deck"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 700) { e.preventDefault(); send(); } }}
            />
            <button className="send" disabled={busy || (!input.trim() && files.length === 0)} onClick={() => send()}>Send</button>
          </div>
        </>
      ) : (
        <div className="scroll">
          {error && <div className="err" style={{ padding: '0 0 8px' }}>{error}</div>}
          <div className="tabs" style={{ padding: '0 0 12px' }}>
            <button className={`tab ${view === 'overview' ? 'on' : ''}`} onClick={() => setView('overview')}>Overview</button>
            <button className={`tab ${view === 'gantt' ? 'on' : ''}`} onClick={() => setView('gantt')}>Gantt</button>
          </div>
          {view === 'gantt' ? (
            <>
              {taskForm && (
                <TaskForm
                  form={taskForm}
                  setForm={setTaskForm}
                  onSave={saveTask}
                  onDelete={taskForm.id ? deleteTask : null}
                  onCancel={() => setTaskForm(null)}
                  busy={busy}
                  projectName={state.projects.find((p) => p.id === taskForm.project_id)?.name}
                />
              )}
              <Gantt projects={state.projects} tasks={state.tasks || []} today={state.day} onAdd={openAddTask} onEdit={openEditTask} />
            </>
          ) : (
            <>
          <div className="sec">
            <div className="sechead">
              <h2>Today's plan</h2>
              {state.plan.length > 0 && (
                <button
                  className="ghost small"
                  disabled={busy}
                  onClick={() => { setTab('chat'); send(REPLAN); }}
                >
                  Re-plan
                </button>
              )}
            </div>
            {state.plan.length === 0 && (
              <>
                <div className="sub">Not agreed yet.</div>
                <button
                  className="primary small"
                  style={{ marginTop: 8 }}
                  disabled={busy}
                  onClick={() => { setTab('chat'); send(hasToday ? REPLAN : START); }}
                >
                  {hasToday ? 'Plan today in Coach' : "Start today's session"}
                </button>
              </>
            )}
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
                  {p.objective ? (
                    <div className="sub" style={{ marginTop: 4 }}>
                      Goal: {p.objective}{p.deadline ? ` (by ${p.deadline})` : ''}
                    </div>
                  ) : (
                    <div style={{ marginTop: 6 }}>
                      <button
                        className="ghost small"
                        disabled={busy}
                        onClick={() => {
                          setTab('chat');
                          send(`Interview me to build the brief for ${p.name}. Ask a few short questions, one at a time, then save it.`);
                        }}
                      >
                        Build brief with coach
                      </button>
                    </div>
                  )}
                  <div className="frow" style={{ marginTop: 8 }}>
                    <button className="ghost" onClick={() => startEdit(p)}>Edit</button>
                    <button className="ghost danger" disabled={busy} onClick={() => deleteProject(p)}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="sec">
            <h2>Documents</h2>
            {(state.documents || []).length === 0 && (
              <div className="sub">None yet. Attach a business plan or deck in Coach.</div>
            )}
            {(state.documents || []).map((d) => (
              <div key={d.id} className="row ok">
                <b>{d.name}</b>
                <div className="sub">
                  {state.projects.find((p) => p.id === d.project_id)?.name || 'Project'}, saved {String(d.created_at).slice(0, 10)}
                </div>
                <div className="sub">{String(d.summary).slice(0, 160)}</div>
                <div className="frow" style={{ marginTop: 8 }}>
                  <button className="ghost danger small" disabled={busy} onClick={() => deleteDoc(d)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
