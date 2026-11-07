(async () => {
  const until = async fn => {
    for (let i = 0; i < 300; i++) {
      if (fn()) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error('Illustrated walkthrough checkpoint timed out');
  };
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const stylesheet = node('link');
  stylesheet.rel = 'stylesheet'; stylesheet.href = '/illustrated.css';
  const loaded = new Promise((resolve, reject) => { stylesheet.onload = resolve; stylesheet.onerror = () => reject(Error('Video stylesheet failed')); });
  document.head.append(stylesheet);
  await loaded;
  document.body.classList.add('illustrated');
  document.body.append(node('div', 'ILLUSTRATED CHAT · SAMPLE ANSWERS · REAL LOCAL TESTS · CARTESIA-SYNTHESIZED NARRATION', 'video-disclosure'));
  const chat = node('aside', undefined, 'video-chat');
  const rail = node('div', undefined, 'chat-rail');
  rail.append(node('div', 'of.', 'chat-server'), node('div', '+', 'chat-server secondary'));
  const room = node('div', undefined, 'chat-room');
  const heading = node('div', undefined, 'chat-heading');
  heading.append(node('span', '#'), document.createTextNode('own-the-fix'));
  const meta = node('div', undefined, 'chat-meta');
  meta.append(node('strong', 'Discord-style illustration'), node('div', 'Not a live recording or proof of Discord transport.'));
  const messages = node('div', undefined, 'chat-messages');
  room.append(heading, meta, messages, node('div', 'Message #own-the-fix', 'chat-input'), node('div', 'Sample conversation. Wispr dictation is not recorded in this video.', 'chat-foot'));
  chat.append(rail, room); document.body.append(chat);
  function conversation(entries) {
    messages.replaceChildren();
    for (const [agent, text] of entries) {
      const row = node('div', undefined, 'chat-message');
      row.append(node('div', agent ? 'S' : 'D', `chat-avatar${agent ? ' agent' : ''}`));
      const content = node('div', undefined, 'chat-content');
      const author = node('div', agent ? 'Switch agent' : 'Developer', `chat-author${agent ? ' agent' : ''}`);
      if (agent) author.append(node('small', 'ILLUSTRATED'));
      content.append(author, node('p', text)); row.append(content); messages.append(row);
    }
  }
  const main = document.querySelector('main');
  const hero = node('section', undefined, 'video-hero');
  main.prepend(hero);
  const workspace = document.querySelector('.workspace');
  const panels = ['.checkpoint-card', '.source-card', '#evidence-card', '#daily-card'];
  function show(selectors) {
    hero.hidden = true;
    workspace.hidden = false;
    for (const selector of panels) document.querySelector(selector).hidden = !selectors.includes(selector);
    document.querySelector('#daily-card').style.display = selectors.includes('#daily-card') ? 'block' : 'none';
    document.querySelector('#daily-card').hidden = !selectors.includes('#daily-card');
    document.querySelector('.history-card').hidden = true;
    document.querySelector('.work-area').prepend(document.querySelector('.checkpoint-card'));
    window.scrollTo(0, 0);
  }
  function title(eyebrow, heading, description, rule) {
    workspace.hidden = true;
    document.querySelector('#daily-card').hidden = true;
    hero.hidden = false; hero.replaceChildren(node('span', eyebrow, 'eyebrow'), node('h1', heading), node('p', description), node('div', rule, 'hero-rule'));
    window.scrollTo(0, 0);
  }
  async function capture(index) {
    await new Promise(resolve => setTimeout(resolve, 500));
    window.captureWaiting = index;
    window.webkit.messageHandlers.walkthrough.postMessage(`CAPTURE:${index}`);
    await until(() => window.captureWaiting === null);
  }
  function fill(selector, values) {
    const form = document.querySelector(selector);
    for (const [key, value] of Object.entries(values)) form.elements[key].value = value;
    return form;
  }
  const request = async endpoint => {
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${sessionStorage.getItem('own-fix-token')}` } });
    if (!response.ok) throw Error('Could not read isolated video context');
    return response.json();
  };
  await until(() => document.querySelector('#start-case'));
  conversation([[false, 'The AI fixed it. But why this approach? What did I actually learn?'], [true, 'Let us keep your reasoning with the work, instead of skipping to a patch.']]);
  title('THE BUSINESS PROBLEM', 'The code ships.\nThe understanding gets left behind.', 'Developers need to explain their changes, defend their decisions, and remember what they learned.', 'Faster delivery should not mean surrendering ownership.');
  await capture(1);
  conversation([[false, 'Help me understand the fix, not just get the answer.'], [true, 'Your hypothesis → code explanation → prediction → choice → tests → teach-back → daily recap.']]);
  title('OWN THE FIX', 'Ship the fix.\nKeep the understanding.', 'A Switch human–agent workflow with a local evidence dashboard and daily GitHub activity / learning recap.', 'Illustrated chat and sample answers. Actual local dashboard and executed tests.');
  await capture(2);
  document.querySelector('#start-case').click();
  await until(() => document.querySelector('#hypothesis-form'));
  conversation([[false, 'I type “ca”, then “cats”. The older result arrives late and replaces the cats results.'], [true, 'The latest started search should own the screen. Let us inspect the actual source.']]);
  show(['.source-card']);
  const issueCard = document.querySelector('aside .card').cloneNode(true);
  issueCard.classList.add('video-issue');
  document.querySelector('.work-area').prepend(issueCard);
  await capture(3);
  issueCard.remove();
  fill('#hypothesis-form', { quote: 'Sample hypothesis: an older request can finish later and still update the screen.' }).requestSubmit();
  await until(() => document.querySelector('#checkpoint-title').textContent.includes('agent should explain'));
  window.webkit.messageHandlers.walkthrough.postMessage('ACTION:explain');
  await until(() => document.querySelector('#prediction-form'));
  conversation([[false, 'My guess: an older request finishes late but still updates the screen.'], [true, 'await pauses one invocation, not every search. Line 4 publishes every response without checking freshness. What will happen if A finishes after B?'], [false, 'My prediction: the old result will overwrite the new one.']]);
  fill('#prediction-form', { quote: 'Sample prediction: A finishes last and overwrites the newer result because line 4 does not check which request is current.' });
  show(['.checkpoint-card', '.source-card']);
  await capture(4);
  document.querySelector('#prediction-form').requestSubmit();
  await until(() => document.querySelector('#choice-form'));
  conversation([[true, 'A latest-request guard ignores old results. Cancellation can stop cooperating work, but still needs a freshness check.'], [false, 'I choose the guard. It works without cancellation. I accept that older requests still use resources.']]);
  const choice = fill('#choice-form', { quote: 'Sample choice: use the latest-request guard. Cancellation is not guaranteed; I accept that older work still runs.' });
  choice.querySelector('input[value="request-id"]').checked = true;
  show(['.checkpoint-card']);
  await capture(5);
  choice.requestSubmit();
  await until(() => document.querySelector('#checkpoint-title').textContent.includes('agent can execute'));
  window.webkit.messageHandlers.walkthrough.postMessage('ACTION:implement');
  await until(() => document.querySelector('#teachback-form'));
  conversation([[false, 'My choice is recorded. Apply only that prepared demo patch and run the tests.'], [true, 'Executed: node --test --test-reporter=tap search.test.mjs. Before: 1 pass, 3 fail. After: 4 pass, 0 fail. These tests are real; this chat is illustrated.']]);
  show(['#evidence-card']);
  const after = document.querySelectorAll('#test-output details')[1];
  if (after) after.open = true;
  await capture(6);
  fill('#teachback-form', {
    quote: 'Sample explanation: only the latest started request may publish results. Finishing last does not make an old request current.',
    testLimit: 'Controlled promise tests do not establish production loading behavior, real-network behavior, or accessibility.'
  }).requestSubmit();
  await until(() => document.querySelector('#download-receipt'));
  const state = await request('/api/context');
  conversation([[true, 'Before finishing, explain the change and one limitation in your own words.'], [false, state.teachback.quote], [true, 'Your decision receipt preserves your choice, explanation, alternative, and test evidence. It does not certify understanding.']]);
  show(['.checkpoint-card']);
  const summary = node('section', undefined, 'card video-summary');
  summary.append(node('span', 'PRESERVED LOCAL EVIDENCE', 'eyebrow'), node('h2', 'My explanation and test limitation'), node('pre', `${state.teachback.quote}\n\nWhat the tests do not prove:\n${state.teachback.testLimit}\n\nBefore: 1 pass · 3 fail\nAfter: 4 pass · 0 fail`));
  document.querySelector('.work-area').append(summary);
  await capture(7);
  summary.remove();
  window.webkit.messageHandlers.walkthrough.postMessage('ACTION:github');
  await until(() => document.querySelector('#github-status').textContent.includes('amangithub01/own-the-fix') && document.querySelector('#daily-recap').textContent.includes('Sample explanation'));
  conversation([[false, 'What did I do and learn today, even if I raise a PR later?'], [true, 'The recap keeps your PR metadata and your recorded learning separate. GitHub is connected; this new repo has no PRs yet. No learning is guessed from a title.']]);
  show(['#daily-card']);
  workspace.hidden = true;
  const daily = await request('/api/github');
  const learning = daily.learning.at(-1);
  document.querySelector('#daily-recap').textContent = [
    `SAVED RECAP EXCERPT - ${daily.day} (IST)`,
    `Repository: ${daily.config.repository}`,
    `PR activity: ${daily.prs.length ? daily.prs.map(pr => `#${pr.number}: ${pr.title}`).join('; ') : 'No matching PR activity at last successful check.'}`,
    '',
    'LOCAL LEARNING - NOT AUTOMATICALLY LINKED TO A PR',
    'My chosen approach:', learning.approach, learning.rationale,
    '',
    'My explanation:', learning.explanation,
    '',
    'Test limitation / follow-up:', learning.testLimit,
    '',
    'Full Markdown recap is saved locally and available to download.'
  ].join('\n');
  await capture(8);
  conversation([[false, 'Now I have a fix, a reason I can explain, and a record to revisit.'], [true, 'Switch carries the real conversation. Wispr can supply reviewed text. This video illustrates that flow; it is not a live transport or microphone recording.']]);
  title('SHIP THE FIX. KEEP THE UNDERSTANDING.', 'Your decisions.\nYour learning.\nStill yours.', 'Guided code decisions · executed verification · PR-ready summary · daily activity and learning recap', 'github.com/amangithub01/own-the-fix');
  await capture(9);
  if (window.testErrors.length) throw Error(window.testErrors.join('; '));
  return true;
})
