import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { directory, read, issue } from './workflow.mjs';

const execute = promisify(execFile);
export const intervalMs = 5 * 60 * 1000;
export function dayAt(now = new Date()) {
  return new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
}
export function dayStart(day) {
  return new Date(`${day}T00:00:00+05:30`).toISOString();
}
export function repositoryName(value) {
  const name = typeof value === 'string' ? value.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '') : '';
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(name)) throw new Error('Use a GitHub owner/repository or its repository URL.');
  return name;
}
async function github(args) {
  try {
    const { stdout } = await execute('gh', ['api', '--hostname', 'github.com', ...args], {
      encoding: 'utf8', timeout: 20000, maxBuffer: 2000000,
      env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_PAGER: 'cat' }
    });
    return JSON.parse(stdout);
  } catch {
    throw new Error('GitHub request failed. Check gh auth status, repository access, and your connection; the previous recap is preserved.');
  }
}
const line = value => String(value || '').replace(/[\r\n]+/g, ' ');
const quote = value => String(value || '').split('\n').map(part => `> ${part}`).join('\n');
export function prSummary(learning) {
  if (!learning) return 'Complete the guided case and record your own explanation before generating a PR summary.';
  return [
    '## Change', issue.description, '',
    '## Approach and rationale', line(learning.approach), quote(learning.rationale), '',
    '## Verification', `Before: ${learning.before.passCount} passed, ${learning.before.failCount} failed.`,
    `After: ${learning.after.passCount} passed, ${learning.after.failCount} failed.`,
    `Command: \`${learning.after.command}\``, '',
    '## Explanation', quote(learning.explanation), '',
    '## Limits / follow-up', quote(learning.testLimit), '',
    'This describes the prepared local demo fix, not an automatically inspected GitHub diff.'
  ].join('\n');
}
export function recapMarkdown(day, entry, config) {
  const parts = [
    `# What I did and learned - ${day} (IST)`, '',
    `Repository: ${config?.repository || 'Not connected'}`,
    `PR author: ${config?.author || 'Not connected'}`,
    `Last successful GitHub check: ${entry.lastSync || 'Not yet checked'}`, '',
    '## GitHub PR activity', 'PRs created or updated during this IST day; an update can include comments or bot activity, not just code changes.', ''
  ];
  for (const pr of entry.prs) {
    parts.push(`- [#${pr.number}: ${line(pr.title)}](${pr.url}) - ${pr.state}; created ${pr.createdAt}; updated ${pr.updatedAt}`);
  }
  if (!entry.prs.length) parts.push(entry.lastSync ? 'No matching PR activity at the last successful check.' : 'GitHub activity has not been checked successfully.');
  parts.push('', '## Local work and learning (not automatically linked to a PR)', '');
  for (const learning of entry.learning) {
    parts.push(`### Guided case: ${line(issue.title)}`, `Completed: ${learning.at}`,
      'My chosen approach and reason:', line(learning.approach), quote(learning.rationale),
      'My explanation / learning, in my own words:', quote(learning.explanation),
      'What the checks do not establish / follow-up:', quote(learning.testLimit),
      `Verification: ${learning.after.passCount} passed, ${learning.after.failCount} failed.`, '');
  }
  if (!entry.learning.length) parts.push('No completed teach-back recorded for this day. Learning is not inferred from PR activity.');
  parts.push('', 'Read-only metadata snapshot, not a complete GitHub event audit. No PR comments or repository code are fetched. Review before sharing.');
  return parts.join('\n');
}
export function createMonitor({ dir = directory(), request = github, now = () => new Date() } = {}) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'github-recaps.json');
  let data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { config: null, days: {}, error: null };
  let queue = Promise.resolve();
  function serialize(task) {
    const next = queue.then(task);
    queue = next.catch(() => {});
    return next;
  }
  function save() {
    const temporary = path.join(dir, `github.${crypto.randomUUID()}.tmp`);
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, file);
    const recaps = path.join(dir, 'daily-recaps');
    fs.mkdirSync(recaps, { recursive: true, mode: 0o700 });
    for (const [day, entry] of Object.entries(data.days)) {
      const destination = path.join(recaps, `${day}.md`);
      const markdown = recapMarkdown(day, entry, entry.config);
      if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== markdown) {
        fs.writeFileSync(destination, markdown, { mode: 0o600 });
      }
    }
  }
  function collect() {
    const date = dayAt(now());
    let changed = !data.days[date];
    data.days[date] ||= { prs: [], learning: [], lastSync: null, config: data.config };
    const state = read(dir);
    const at = state.history.findLast(event => event.type === 'teachback')?.at;
    if (state.stage === 'complete' && state.verification?.passed && at) {
      const day = dayAt(new Date(at));
      data.days[day] ||= { prs: [], learning: [], lastSync: null, config: data.config };
      if (!data.days[day].learning.some(item => item.caseId === state.caseId)) {
        data.days[day].learning.push({
          caseId: state.caseId, at, approach: state.choice.approach,
          rationale: state.choice.quote, explanation: state.teachback.quote,
          testLimit: state.teachback.testLimit,
          before: { passCount: state.baseline.passCount, failCount: state.baseline.failCount },
          after: { passCount: state.verification.passCount, failCount: state.verification.failCount, command: state.verification.command }
        });
        changed = true;
      }
    }
    if (changed) save();
  }
  function status() {
    collect();
    const day = dayAt(now()), entry = data.days[day];
    return {
      config: data.config, error: data.error, intervalMinutes: intervalMs / 60000,
      day, lastSync: entry.lastSync, prs: entry.prs, learning: entry.learning,
      recap: recapMarkdown(day, entry, entry.config),
      prSummary: prSummary(entry.learning.at(-1)),
      days: Object.keys(data.days).sort().reverse()
    };
  }
  async function sync() {
    collect();
    if (!data.config) return status();
    const config = data.config, day = dayAt(now());
    try {
      const user = await request(['user']);
      if (user.login.toLowerCase() !== config.author.toLowerCase()) throw new Error(`GitHub is signed in as ${user.login}, not ${config.author}. Reconnect deliberately before monitoring another account.`);
      const q = `repo:${config.repository} is:pr author:${config.author} updated:>=${dayStart(day)}`;
      let items = [];
      for (let page = 1; page <= 3; page++) {
        const result = await request(['--method', 'GET', 'search/issues', '-f', `q=${q}`, '-f', 'sort=updated', '-f', 'order=desc', '-f', 'per_page=100', '-f', `page=${page}`]);
        if (result.incomplete_results || result.total_count > 300) throw new Error('GitHub returned incomplete or excessive results. Narrow the repository scope; previous activity is preserved.');
        items.push(...result.items);
        if (items.length >= result.total_count) break;
        if (!result.items.length || page === 3) throw new Error('GitHub pagination was incomplete; previous activity is preserved.');
      }
      const unique = new Map();
      for (const item of items) {
        if (!item.pull_request || item.user?.login?.toLowerCase() !== config.author.toLowerCase()) continue;
        if (dayAt(new Date(item.updated_at)) !== day) continue;
        if (!Number.isInteger(item.number) || item.html_url !== `https://github.com/${config.repository}/pull/${item.number}`) continue;
        unique.set(item.number, {
          number: item.number, title: line(item.title).slice(0, 1000), url: item.html_url,
          state: item.pull_request.merged_at ? 'merged' : item.state,
          createdAt: item.created_at, updatedAt: item.updated_at
        });
      }
      Object.assign(data.days[day], { prs: [...unique.values()], lastSync: now().toISOString(), config: { ...config } });
      data.error = null;
      save();
    } catch (error) {
      data.error = error.message;
      save();
      throw error;
    }
    return status();
  }
  return {
    status: () => serialize(status),
    sync: () => serialize(sync),
    connect: repository => serialize(async () => {
      const name = repositoryName(repository);
      const user = await request(['user']);
      const repo = await request([`repos/${name}`]);
      if (!user.login || repo.full_name?.toLowerCase() !== name.toLowerCase()) throw new Error('Could not verify the repository and signed-in GitHub account.');
      collect();
      const current = data.days[dayAt(now())];
      if (data.config && (data.config.repository.toLowerCase() !== repo.full_name.toLowerCase() || data.config.author.toLowerCase() !== user.login.toLowerCase())) {
        throw new Error('This local tracker is already connected. Use a separate OWN_FIX_DATA_DIR for another repository/account to preserve recap provenance.');
      }
      data.config = { repository: repo.full_name, author: user.login };
      current.config = { ...data.config };
      data.error = null;
      save();
      return sync();
    }),
    archive: day => serialize(() => {
      collect();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !data.days[day]) throw new Error('No saved recap for that day.');
      return recapMarkdown(day, data.days[day], data.days[day].config);
    })
  };
}
