const incomingToken = location.hash.slice(1);
if (incomingToken) sessionStorage.setItem('own-fix-token', incomingToken);
const token = incomingToken || sessionStorage.getItem('own-fix-token');
history.replaceState(null, '', location.pathname);
const $ = selector => document.querySelector(selector);
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
let state, busy = false, toastTimer;
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 6000);
}
async function api(path, operation) {
  const response = await fetch(path, {
    method: operation ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(operation ? { 'Content-Type': 'application/json' } : {}) },
    ...(operation ? { body: JSON.stringify(operation) } : {})
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Request failed.');
  return value;
}
async function act(operation) {
  if (busy) return;
  busy = true;
  try {
    state = await api('/api/action', { ...operation, revision: state.revision });
    render();
    toast('Recorded. Your next checkpoint is ready.');
  } catch (error) { toast(error.message); await refresh(); }
  finally { busy = false; }
}
const labels = { hypothesis: 'Hypothesis', explanation: 'Understand', prediction: 'Predict', choice: 'Choose', implementation: 'Verify', teachback: 'Explain back', complete: 'Receipt' };
const prompts = {
  not_started: ['Start with a real, reproducible bug.', 'This is a small JavaScript case—not private employer code. The baseline tests run when you start.'],
  hypothesis: ['Before the agent explains: what might be happening?', 'A rough guess is useful. If you don’t know, say so; ask for one hint rather than surrendering the whole decision.'],
  explanation: ['Your agent should explain this slice—not fix it yet.', 'Ask it to connect unfamiliar terms to actual source lines. It must record that explanation before the prediction checkpoint opens.'],
  prediction: ['What will the screen show after this sequence?', 'A starts, B starts, B finishes, then A finishes. Predict the final display and explain which line makes you think so.'],
  choice: ['Two viable fixes. Your decision.', 'Review the actual baseline evidence and the tradeoffs. A passing check alone does not tell us which approach best fits the constraints.'],
  implementation: ['The approach is yours. Now the agent can execute.', 'Your Switch agent can apply the selected demo patch and run the tests. No earlier checkpoint permits implementation.'],
  teachback: ['Could you explain this fix to its next maintainer?', 'Describe what changed and why in your own words. Then name something these tests don’t establish. The app records your explanation; it does not grade understanding.'],
  complete: ['Ship the fix. Keep the reasoning.', 'Your decision receipt contains your own words, the before/after code, the alternative, and actual verification output.']
};
function humanForm(type, placeholder) {
  const form = el('form', undefined, 'checkpoint-form');
  form.id = `${type}-form`;
  const input = el('textarea');
  input.name = 'quote'; input.rows = 4; input.required = true; input.maxLength = 4000;
  input.placeholder = placeholder; input.setAttribute('aria-label', `Your ${type}`);
  form.append(input);
  if (type === 'teachback') {
    const limit = el('textarea');
    limit.name = 'testLimit'; limit.rows = 2; limit.required = true; limit.maxLength = 4000;
    limit.placeholder = 'What do the passing tests NOT prove?';
    limit.setAttribute('aria-label', 'A limitation of the verification');
    form.append(limit);
  }
  const submit = el('button', type === 'teachback' ? 'Save my explanation & receipt' : 'Record my thinking', 'primary');
  submit.type = 'submit'; form.append(submit);
  form.onsubmit = event => { event.preventDefault(); act({ type, ...Object.fromEntries(new FormData(form)) }); };
  return form;
}
function agentStep(text) {
  const wrapper = el('div');
  wrapper.append(el('div', text, 'agent-instruction'));
  const copy = el('button', 'Copy this request for Discord', 'copy-button');
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(text); toast('Copied. Send this to your Switch agent in Discord.'); }
    catch { toast('Select and copy the request text above.'); }
  };
  wrapper.append(copy);
  return wrapper;
}
function render() {
  $('#issue-description').textContent = state.issue.description;
  $('#scenario').replaceChildren(...state.issue.scenario.map((line, index) => el('div', `${index + 1}. ${line}`)));
  $('#requirements').replaceChildren(...state.issue.requirements.map(line => el('li', line)));
  const current = state.stages.indexOf(state.stage);
  $('#progress').replaceChildren(...state.stages.map((stage, index) => {
    const node = el('div', `${index < current ? '✓' : String(index + 1).padStart(2, '0')}`, `step${index === current ? ' current' : index < current ? ' done' : ''}`);
    node.append(el('strong', labels[stage]));
    return node;
  }));
  const human = ['not_started', 'hypothesis', 'prediction', 'choice', 'teachback'].includes(state.stage);
  $('#actor-label').textContent = human ? 'YOUR TURN' : state.stage === 'complete' ? 'DECISION RECORDED' : 'AGENT TURN';
  $('#stage-label').textContent = state.stage === 'not_started' ? 'Before the first answer' : `Stage ${current + 1} of ${state.stages.length}`;
  $('#checkpoint-title').textContent = prompts[state.stage][0];
  $('#checkpoint-description').textContent = prompts[state.stage][1];
  const checkpoint = $('#checkpoint');
  checkpoint.replaceChildren();
  if (state.stage === 'not_started') {
    const start = el('button', 'Start the stale-search case', 'primary');
    start.id = 'start-case'; start.onclick = () => act({ type: 'start' }); checkpoint.append(start);
  } else if (['hypothesis', 'prediction', 'teachback'].includes(state.stage)) {
    checkpoint.append(humanForm(state.stage, state.stage === 'hypothesis' ? 'My first guess is… / I don’t know yet…' : state.stage === 'prediction' ? 'I think the screen will show… because…' : 'The fix changes… We chose it because…'));
  } else if (state.stage === 'explanation') {
    checkpoint.append(agentStep('Read /Users/priyakumari/own-the-fix/switch-room.txt and follow its rules. Run node /Users/priyakumari/own-the-fix/tools/fix.mjs context. Explain the current source in plain language, with relevant terms and real line references. Record it using the explain operation. Do not implement or write my prediction for me.'));
  } else if (state.stage === 'choice') {
    const form = el('form', undefined, 'checkpoint-form');
    form.id = 'choice-form';
    const options = el('div', undefined, 'options');
    for (const approach of state.approaches) {
      const option = el('label', undefined, 'option');
      const radio = el('input');
      radio.type = 'radio'; radio.name = 'approach'; radio.value = approach.id; radio.required = true;
      option.append(radio, el('strong', approach.title), el('p', approach.mechanism), el('p', `Why consider it: ${approach.advantage}`), el('small', `Tradeoff: ${approach.tradeoff}`));
      options.append(option);
    }
    const rationale = el('textarea'); rationale.name = 'quote'; rationale.rows = 3; rationale.required = true; rationale.maxLength = 4000;
    rationale.placeholder = 'I choose this because… The tradeoff I accept is…'; rationale.setAttribute('aria-label', 'Your choice rationale');
    const submit = el('button', 'Choose & authorize this demo patch', 'primary'); submit.type = 'submit';
    form.append(options, rationale, submit);
    form.onsubmit = event => { event.preventDefault(); act({ type: 'choose', ...Object.fromEntries(new FormData(form)) }); };
    checkpoint.append(form);
  } else if (state.stage === 'implementation') {
    checkpoint.append(agentStep('Read my Own the Fix context with node /Users/priyakumari/own-the-fix/tools/fix.mjs context. My approach choice is recorded. Apply only that selected demo patch using the implement operation. Report the executed command, what the passing tests prove, and what they do not. Then ask me to explain the fix in my own words.'));
  } else if (state.stage === 'complete') {
    const download = el('button', 'Download decision receipt', 'primary');
    download.id = 'download-receipt';
    download.onclick = async () => {
      const response = await fetch('/api/receipt', { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) { toast('Receipt unavailable.'); return; }
      const url = URL.createObjectURL(await response.blob());
      const link = el('a'); link.href = url; link.download = 'decision-receipt.md'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    checkpoint.append(download);
  }
  const source = $('#source');
  source.replaceChildren();
  const code = state.afterSource || state.beforeSource;
  if (code) {
    code.trimEnd().split('\n').forEach((line, index) => {
      const row = el('div'); row.append(el('span', String(index + 1).padStart(2, '0'), 'line-number'), document.createTextNode(line)); source.append(row);
    });
  } else source.textContent = 'Start the case to load the source and run baseline verification.';
  const explanation = $('#explanation');
  explanation.replaceChildren();
  if (state.explanation) {
    explanation.append(el('p', state.explanation.summary));
    const terms = el('div', undefined, 'terms');
    for (const item of state.explanation.terms) {
      const term = el('details', undefined, 'term');
      term.append(el('summary', item.term), el('p', item.meaning)); terms.append(term);
    }
    explanation.append(terms);
    for (const item of state.explanation.annotations) {
      const row = el('div', undefined, 'annotation');
      row.append(el('strong', `Original line ${item.line}: `), document.createTextNode(item.meaning)); explanation.append(row);
    }
  }
  const notes = $('#human-notes');
  notes.replaceChildren();
  for (const [title, quote] of [['HYPOTHESIS', state.hypothesis], ['PREDICTION', state.prediction], ['CHOICE', state.choice?.quote], ['MY EXPLANATION', state.teachback?.quote]]) {
    if (quote) notes.append(el('div', title, 'note-heading'), el('blockquote', quote));
  }
  if (!notes.children.length) notes.append(el('p', 'Your words will appear here, separate from the agent’s explanations.', 'quiet'));
  $('#evidence-card').hidden = !state.baseline;
  const stats = el('div', undefined, 'test-stats');
  for (const [title, result] of [['Before', state.baseline], ['After', state.verification]]) {
    if (!result) continue;
    const stat = el('div', undefined, `test-stat ${result.passed ? 'pass' : 'fail'}`);
    stat.append(el('strong', `${result.passCount} pass · ${result.failCount} fail`), el('small', `${title} · actually executed`)); stats.append(stat);
  }
  $('#test-summary').replaceChildren(stats);
  $('#test-output').replaceChildren();
  for (const [title, result] of [['Baseline output', state.baseline], ['Selected-fix output', state.verification]]) {
    if (!result) continue;
    const details = el('details'); details.append(el('summary', `${title}: ${result.command}`), el('pre', result.output)); $('#test-output').append(details);
  }
  $('#history').replaceChildren(...state.history.map(event => {
    const row = el('div', undefined, 'history-item');
    row.append(el('small', new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })), el('span', event.description), el('span', event.source, 'source'));
    return row;
  }));
}
async function refresh() {
  try {
    const incoming = await api('/api/context');
    if (!state || incoming.revision !== state.revision) { state = incoming; render(); }
  } catch (error) { toast(error.message); }
}
let daily, dailyBusy = false, dailyKey;
async function refreshDaily() {
  try {
    const incoming = await api('/api/github');
    const key = JSON.stringify(incoming);
    daily = incoming;
    if (key === dailyKey) return;
    dailyKey = key;
    $('#github-connect').hidden = Boolean(daily.config);
    $('#github-sync').disabled = !daily.config || dailyBusy;
    $('#copy-pr').disabled = !daily.learning.length;
    $('#github-status').textContent = `${daily.config ? `${daily.config.repository} · PR author ${daily.config.author}` : 'Not connected. Sign in with gh auth login, then connect a repository.'}\nLast successful check: ${daily.lastSync || 'Not yet checked'}${daily.error ? `\nCheck failed: ${daily.error}` : ''}`;
    $('#daily-recap').textContent = daily.recap;
    const selected = $('#recap-day').value;
    $('#recap-day').replaceChildren(...daily.days.map(day => {
      const option = el('option', `${day} (IST)`); option.value = day; return option;
    }));
    if (daily.days.includes(selected)) $('#recap-day').value = selected;
  } catch (error) { toast(error.message); }
}
async function dailyAction(endpoint, operation) {
  if (dailyBusy) return;
  dailyBusy = true;
  $('#github-sync').disabled = true;
  $('#github-connect button').disabled = true;
  try {
    await api(endpoint, operation);
    toast('GitHub activity checked. Your local recap is saved.');
  } catch (error) { toast(error.message); }
  finally {
    dailyBusy = false; dailyKey = null;
    $('#github-connect button').disabled = false;
    await refreshDaily();
  }
}
$('#github-connect').onsubmit = event => {
  event.preventDefault();
  dailyAction('/api/github/connect', { repository: $('#github-repository').value });
};
$('#github-sync').onclick = () => dailyAction('/api/github/sync', {});
for (const [id, field] of [['#copy-pr', 'prSummary'], ['#copy-recap', 'recap']]) {
  $(id).onclick = async () => {
    try { await navigator.clipboard.writeText(daily[field]); toast('Copied. Review before sharing.'); }
    catch { toast('Clipboard unavailable. Select the recap text or download it.'); }
  };
}
$('#download-recap').onclick = async () => {
  const day = $('#recap-day').value;
  try {
    const response = await fetch(`/api/recap?day=${encodeURIComponent(day)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error((await response.json()).error || 'Recap unavailable.');
    const url = URL.createObjectURL(await response.blob());
    const link = el('a'); link.href = url; link.download = `daily-recap-${day}.md`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { toast(error.message); }
};
await Promise.all([refresh(), refreshDaily()]);
setInterval(() => { if (!busy && !document.hidden) refresh(); }, 1500);
setInterval(() => { if (!dailyBusy && !document.hidden) refreshDaily(); }, 5000);
