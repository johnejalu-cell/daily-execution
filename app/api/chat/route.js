import { NextResponse } from 'next/server';
import { db, authorized, loadState, today } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-5-5';

const TOOLS = [
  {
    name: 'add_project',
    description: 'Add a new project or objective.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        next_step: { type: 'string' },
        priority: { type: 'integer', description: '1 = highest, 5 = lowest' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_project',
    description: 'Update a project. Any update counts as touching it (resets the stale clock). Use whenever the user reports progress or the next step changes.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        status: { type: 'string', enum: ['active', 'paused', 'done'] },
        priority: { type: 'integer' },
        next_step: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'add_commitment',
    description: 'Record a commitment the user made, so it is followed up in later sessions.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        due_date: { type: 'string', description: 'YYYY-MM-DD' },
        project_id: { type: 'string' },
      },
      required: ['text'],
    },
  },
  {
    name: 'complete_commitment',
    description: 'Mark a commitment done.',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'save_plan',
    description: "Save today's agreed to-do list. Only call after the user has agreed or edited the proposal.",
    input_schema: {
      type: 'object',
      properties: { items: { type: 'array', items: { type: 'string' } } },
      required: ['items'],
    },
  },
  {
    name: 'add_task',
    description: 'Add a dated implementation step (Gantt bar) to a project. Use this to break projects into concrete steps with realistic start and end dates.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        title: { type: 'string' },
        start_date: { type: 'string', description: 'YYYY-MM-DD' },
        end_date: { type: 'string', description: 'YYYY-MM-DD, on or after start_date' },
        status: { type: 'string', enum: ['todo', 'doing', 'done'] },
      },
      required: ['project_id', 'title', 'start_date', 'end_date'],
    },
  },
  {
    name: 'update_task',
    description: 'Update a Gantt step: reschedule, rename, change status or progress. Use when the user reports progress or a slip.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        status: { type: 'string', enum: ['todo', 'doing', 'done'] },
        progress: { type: 'integer', description: '0-100' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_task',
    description: 'Delete a Gantt step.',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
];

const touch = (id) =>
  db.from('projects').update({ last_touched: new Date().toISOString() }).eq('id', id);

async function runTool(name, input) {
  try {
    if (name === 'add_project') {
      const { data, error } = await db.from('projects').insert({
        name: input.name,
        next_step: input.next_step || '',
        priority: input.priority || 3,
      }).select().single();
      if (error) throw error;
      return `Added project ${data.name} (id ${data.id})`;
    }
    if (name === 'update_project') {
      const { id, ...rest } = input;
      const { error } = await db.from('projects').update({ ...rest, last_touched: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      return 'Project updated';
    }
    if (name === 'add_commitment') {
      const { error } = await db.from('commitments').insert({
        text: input.text,
        due_date: input.due_date || null,
        project_id: input.project_id || null,
      });
      if (error) throw error;
      return 'Commitment recorded';
    }
    if (name === 'complete_commitment') {
      const { error } = await db.from('commitments')
        .update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', input.id);
      if (error) throw error;
      return 'Commitment completed';
    }
    if (name === 'save_plan') {
      const { error } = await db.from('plans').upsert({
        day: today(), items: input.items, updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return 'Plan saved';
    }
    if (name === 'add_task') {
      const { data, error } = await db.from('tasks').insert({
        project_id: input.project_id,
        title: input.title,
        start_date: input.start_date,
        end_date: input.end_date,
        status: input.status || 'todo',
      }).select().single();
      if (error) throw error;
      await touch(input.project_id);
      return `Added step (id ${data.id})`;
    }
    if (name === 'update_task') {
      const { id, ...rest } = input;
      if (rest.status === 'done') rest.progress = 100;
      const { data, error } = await db.from('tasks').update(rest).eq('id', id).select().single();
      if (error) throw error;
      await touch(data.project_id);
      return 'Step updated';
    }
    if (name === 'delete_task') {
      const { error } = await db.from('tasks').delete().eq('id', input.id);
      if (error) throw error;
      return 'Step deleted';
    }
    return 'Unknown tool';
  } catch (e) {
    console.error('tool error', name, e.message);
    return `Error: ${e.message}`;
  }
}

function daysSince(ts) {
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
}

function buildSystem(s) {
  const projects = s.projects.map((p) =>
    `- [${p.id}] ${p.name} | ${p.status} | P${p.priority} | untouched ${daysSince(p.last_touched)}d | next: ${p.next_step || 'none'}${p.notes ? ' | notes: ' + p.notes : ''}`
  ).join('\n') || '(none)';
  const commitments = s.commitments.map((c) => {
    const late = c.due_date && c.due_date < s.day ? ' OVERDUE' : '';
    return `- [${c.id}] ${c.text} | due ${c.due_date || 'none'}${late}`;
  }).join('\n') || '(none)';
  const tasks = (s.tasks || []).filter((t) => s.projects.some((p) => p.id === t.project_id)).map((t) => {
    const pn = s.projects.find((p) => p.id === t.project_id)?.name;
    const late = t.status !== 'done' && t.end_date < s.day ? ' | LATE' : '';
    return `- [${t.id}] ${pn}: ${t.title} | ${t.start_date} to ${t.end_date} | ${t.status} | ${t.progress}%${late}`;
  }).join('\n') || '(none)';
  const prev = s.prevPlan && s.prevPlan.items.length
    ? `(${s.prevPlan.day})\n` + s.prevPlan.items.map((i) => `- ${i}`).join('\n')
    : '(none)';
  const plan = s.plan.length ? s.plan.map((i) => `- ${i}`).join('\n') : '(not agreed yet)';

  return `You are John's daily execution coach. John is a non-technical founder in Kampala (EAT) running many parallel projects. Today is ${s.day}.

Your job:
1. Each day gets a fresh plan. At session start (or when asked to start the day): review projects, steps and commitments, then propose a prioritized to-do list for today with one-line reasoning per item. Carry forward unfinished items from LAST PLAN: if he has not confirmed they were done, list them as carried-over (mark them 'carried over') and ask him in one line which were finished or should be dropped. Do not assume they were completed. Ask for agreement or edits. Once he agrees, call save_plan with the final list. If TODAY'S AGREED PLAN already exists, do not re-propose it; ask what is next or what changed, unless he explicitly asks to re-plan. On a re-plan request, ask in one line what is done, propose an updated list that replaces today's plan, and call save_plan again once he agrees.
2. For each active project you discuss, break it into concrete next steps and help him execute them as fast as reasonably possible. Keep next_step current via update_project.
3. Flag projects untouched for 3+ days, and overdue commitments, so nothing is neglected. Do this at session start, briefly.
4. Track commitments: when he promises to do something, call add_commitment. Follow up on open ones. When done, call complete_commitment.
5. If he drifts from the agreed plan, redirect him in one short line, but accept genuine new input and re-prioritize if warranted.
6. When a project or detail is unspecified, pick the most plausible candidate from the data, state which you picked, and proceed.
7. The Gantt chart is built from STEPS. For any active project with no steps, or when asked to plan a project, break it into concrete dated steps and create them with add_task (realistic dates starting from today). When he reports progress or a slip, update the steps with update_task (status, progress, new dates). Flag LATE steps at session start and propose a reschedule. Do not delete steps unless he asks.
8. Call several tools in the same turn when they are independent (for example all add_task calls together). Always end with a short text reply saying what changed. If a tool returns an error, quote the error to him instead of claiming success.

Style: concise, direct, decisive. Plain-text lists using "-" . No motivational talk, no headers, no markdown bold. Keep replies short enough to read on a phone. Give a recommendation, not a menu of options.

PROJECTS:
${projects}

OPEN COMMITMENTS:
${commitments}

STEPS (Gantt):
${tasks}

LAST PLAN (completion not tracked, confirm with him):
${prev}

TODAY'S AGREED PLAN:
${plan}`;
}

async function callClaude(system, messages, noTools = false) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: 2500, system, tools: TOOLS, messages,
      ...(noTools ? { tool_choice: { type: 'none' } } : {}),
    }),
  });
  if (!r.ok) throw new Error(`Claude API ${r.status}: ${await r.text()}`);
  return r.json();
}

export async function POST(req) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { message } = await req.json();
    if (!message?.trim()) return NextResponse.json({ error: 'empty' }, { status: 400 });

    await db.from('messages').insert({ role: 'user', content: message });

    const { data: hist } = await db.from('messages').select('role,content')
      .order('created_at', { ascending: false }).limit(30);
    let msgs = (hist || []).reverse().filter((m) => m.content !== 'Done.').map((m) => ({ role: m.role, content: m.content }));
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();

    let reply = '';
    for (let i = 0; i < 15; i++) {
      const state = await loadState();
      const res = await callClaude(buildSystem(state), msgs);
      if (res.stop_reason === 'tool_use') {
        msgs.push({ role: 'assistant', content: res.content });
        const results = [];
        for (const b of res.content) {
          if (b.type === 'tool_use') {
            results.push({ type: 'tool_result', tool_use_id: b.id, content: await runTool(b.name, b.input) });
          }
        }
        msgs.push({ role: 'user', content: results });
        continue;
      }
      reply = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      break;
    }
    if (!reply) {
      // Ran out of tool rounds or got an empty turn: force a plain-text wrap-up
      const fin = await callClaude(buildSystem(await loadState()), msgs, true);
      reply = fin.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    }
    if (!reply) throw new Error('The coach did not finish. Tap again to retry.');

    await db.from('messages').insert({ role: 'assistant', content: reply });
    return NextResponse.json(await loadState());
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
