import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = process.argv[2];
if (!output) throw new Error('Usage: node tools/create-walkthrough.mjs <output-directory>');
fs.mkdirSync(output, { recursive: true });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'own-fix-video-'));
const env = { ...process.env, OWN_FIX_DATA_DIR: temporary, OWN_FIX_FRAME_DIR: output };
const narration = [
  'Own the Fix helps developers ship a fix without surrendering the decisions behind it. This is a narrated prototype walkthrough with sample answers and a local command tool. It is not a recording of live Discord interaction.',
  'The case begins before the proposed solution. A developer gives a rough hypothesis about search requests finishing out of order. Saying I do not know is also valid. The workflow does not grade the answer.',
  'The agent explains the actual code slice, including unfamiliar terms and real source lines. Await pauses one invocation, not every search. Every completed request currently updates the display without checking whether its query is still current.',
  'Before revealing verification evidence, the developer predicts the result of a controlled sequence. Two requests start in order but finish in reverse. Their prediction is preserved separately from the agent explanation.',
  'The developer compares two viable approaches. Cancellation can stop cooperating work, but a latest request guard also works when cancellation is unavailable. In this sample, the developer chooses the guard and explicitly accepts that older requests still use resources.',
  'Only after those checkpoints does the tool apply the selected prepared demo patch. These results are real: the original case has three failing tests, and the selected fix passes all four. The command and output remain available to inspect.',
  'The developer then explains the fix in their own words and identifies what the checks do not prove. Controlled promise tests are not evidence of complete production interface behavior. A green check is not the whole argument.',
  'The final receipt preserves the hypothesis, prediction, choice, alternative, code, and executed verification. Switch carries the real human and agent conversation in the intended workflow. Wispr can supply reviewed dictated text. Neither integration is impersonated in this sample walkthrough.'
];
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) throw result.error || new Error(`${command}: ${result.stderr || result.stdout}`);
  return result.stdout;
};
let server, capture;
try {
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  run('xcrun', ['swiftc', 'tools/walkthrough.swift', '-o', 'build/walkthrough', '-framework', 'AppKit', '-framework', 'WebKit']);
  server = spawn(process.execPath, ['server.mjs'], { cwd: root, env });
  let serverErrors = '';
  server.stderr.on('data', data => { serverErrors += data; });
  const ready = await new Promise((resolve, reject) => {
    let buffer = '';
    server.stdout.on('data', data => {
      buffer += data;
      if (buffer.includes('\n')) resolve(JSON.parse(buffer.split('\n')[0]));
    });
    server.once('error', reject);
    server.once('exit', () => reject(new Error(serverErrors || 'Capture server exited')));
  });
  capture = spawn(path.join(root, 'build', 'walkthrough'), [], { env, stdio: ['pipe', 'pipe', 'inherit'] });
  let buffer = '', actionError;
  capture.stdout.on('data', data => {
    buffer += data;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      if (!line.startsWith('ACTION:')) { console.log(line); continue; }
      const action = line.slice(7);
      const operation = action === 'explain' ? {
        type: 'explain',
        summary: 'Each invocation waits independently. When its result arrives, line 4 updates the display even if another search has already started. The bug is missing ownership of the current result, not a slow network alone.',
        terms: [
          { term: 'await', meaning: 'Pauses this invocation until its promise settles; other searches can still run.' },
          { term: 'race condition', meaning: 'The final screen depends on completion order rather than which query is current.' }
        ],
        annotations: [{ line: 3, meaning: 'Each search waits for its own response.' }, { line: 4, meaning: 'Every response publishes without a freshness check.' }]
      } : action === 'implement' ? { type: 'implement' } : null;
      if (!operation) { actionError = new Error('Unknown capture action'); capture.kill('SIGTERM'); continue; }
      const result = spawnSync(process.execPath, ['tools/fix.mjs', 'apply'], { cwd: root, env, input: JSON.stringify(operation), encoding: 'utf8' });
      if (result.status !== 0) { actionError = new Error(result.stderr); capture.kill('SIGTERM'); }
    }
  });
  capture.stdin.end(ready.url);
  const [status] = await once(capture, 'exit');
  if (actionError) throw actionError;
  if (status !== 0) throw new Error('Walkthrough snapshot capture failed');
  const sample = JSON.parse(fs.readFileSync(path.join(temporary, 'state.json'), 'utf8'));
  if (sample.stage !== 'complete' || sample.verification.passCount !== 4 || sample.baseline.failCount !== 3) throw new Error('Captured verification evidence is incomplete.');
  fs.writeFileSync(path.join(output, 'sample-decision-receipt.md'), sample.receipt);

  const duration = file => Number(JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file])).format.duration);
  const time = seconds => {
    const total = Math.round(seconds * 1000);
    return `${String(Math.floor(total / 3600000)).padStart(2, '0')}:${String(Math.floor(total / 60000) % 60).padStart(2, '0')}:${String(Math.floor(total / 1000) % 60).padStart(2, '0')},${String(total % 1000).padStart(3, '0')}`;
  };
  const quoted = file => `'${file.replaceAll("'", "'\\''")}'`;
  const frames = [], audio = [], subtitles = [];
  let elapsed = 0;
  for (let index = 0; index < narration.length; index++) {
    const number = String(index + 1).padStart(2, '0');
    const text = path.join(output, `narration-${number}.txt`);
    const aiff = path.join(output, `narration-${number}.aiff`);
    const wav = path.join(output, `narration-${number}.wav`);
    fs.writeFileSync(text, narration[index]);
    run('say', ['-r', '175', '-o', aiff, '-f', text]);
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', aiff, '-af', 'apad=pad_dur=0.7', '-ac', '1', '-ar', '44100', wav]);
    const seconds = duration(wav);
    frames.push(`file ${quoted(path.join(output, `frame-${number}.png`))}\nduration ${seconds}`);
    audio.push(`file ${quoted(wav)}`);
    subtitles.push(`${index + 1}\n${time(elapsed)} --> ${time(elapsed + seconds)}\n${narration[index]}\n`);
    elapsed += seconds;
  }
  frames.push(`file ${quoted(path.join(output, 'frame-08.png'))}`);
  const frameList = path.join(output, 'frames.txt'), audioList = path.join(output, 'audio.txt'), captions = path.join(output, 'captions.srt');
  fs.writeFileSync(frameList, frames.join('\n'));
  fs.writeFileSync(audioList, audio.join('\n'));
  fs.writeFileSync(captions, subtitles.join('\n'));
  fs.writeFileSync(path.join(output, 'narration.txt'), 'Generated macOS text-to-speech narration. Sample walkthrough, not live Discord/Wispr footage.\n\n' + narration.join('\n\n'));
  const video = path.join(output, 'own-the-fix-prototype.mp4');
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'concat', '-safe', '0', '-i', frameList, '-f', 'concat', '-safe', '0', '-i', audioList, '-i', captions,
    '-map', '0:v:0', '-map', '1:a:0', '-map', '2:0',
    '-vf', 'scale=1280:720', '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng',
    '-movflags', '+faststart', '-shortest', video], { timeout: 120000 });
  const metadata = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height', '-of', 'json', video]));
  if (!metadata.streams.some(stream => stream.codec_type === 'video') || !metadata.streams.some(stream => stream.codec_type === 'audio')) throw new Error('The generated video is missing picture or narration.');
  console.log(JSON.stringify({ video, seconds: Number(metadata.format.duration), bytes: Number(metadata.format.size), streams: metadata.streams }));
} finally {
  if (capture && capture.exitCode === null && capture.signalCode === null) { capture.kill('SIGTERM'); await once(capture, 'exit'); }
  if (server && server.exitCode === null) { server.kill('SIGTERM'); await once(server, 'exit'); }
  fs.rmSync(temporary, { recursive: true, force: true });
}
