import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [audio, script, output] = process.argv.slice(2).map(value => path.resolve(value));
if (!audio || !script || !output) throw new Error('Usage: node tools/create-illustrated-video.mjs <audio> <nine-paragraph-script> <output-directory>');
const paragraphs = fs.readFileSync(script, 'utf8').trim().split(/\n\s*\n/);
if (paragraphs.length !== 9) throw new Error('Provide the nine-paragraph narration script.');
fs.mkdirSync(output, { recursive: true });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'own-fix-illustrated-'));
const env = {
  ...process.env, OWN_FIX_DATA_DIR: temporary, OWN_FIX_FRAME_DIR: output,
  OWN_FIX_CAPTURE_SCRIPT: path.join(root, 'tools', 'illustrated-walkthrough.js')
};
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 120000 });
  if (result.error || result.status !== 0) throw result.error || Error(`${command}: ${result.stderr}`);
  return result.stdout;
};
let server, capture;
try {
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  run('xcrun', ['swiftc', 'tools/walkthrough.swift', '-o', 'build/walkthrough', '-framework', 'AppKit', '-framework', 'WebKit']);
  server = spawn(process.execPath, ['server.mjs'], { cwd: root, env });
  const ready = await new Promise((resolve, reject) => {
    let buffer = '', errors = '';
    server.stderr.on('data', data => { errors += data; });
    server.stdout.on('data', data => {
      buffer += data;
      if (buffer.includes('\n')) resolve(JSON.parse(buffer.split('\n')[0]));
    });
    server.once('error', reject);
    server.once('exit', () => reject(Error(errors || 'Capture server exited')));
  });
  const secret = new URL(ready.url).hash.slice(1);
  capture = spawn(path.join(root, 'build', 'walkthrough'), [], { env, stdio: ['pipe', 'pipe', 'inherit'] });
  let buffer = '', actionError, tasks = Promise.resolve();
  capture.stdout.on('data', data => {
    buffer += data;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      if (!line.startsWith('ACTION:')) { console.log(line); continue; }
      tasks = tasks.then(async () => {
        const action = line.slice(7);
        if (action === 'github') {
          const response = await fetch(`http://127.0.0.1:${ready.port}/api/github/connect`, {
            method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ repository: 'amangithub01/own-the-fix' })
          });
          if (!response.ok) throw Error((await response.json()).error || 'Live read-only GitHub check failed');
          return;
        }
        const operation = action === 'explain' ? {
          type: 'explain', summary: 'Each search waits independently. Line 4 updates the screen without checking whether the request is still current.',
          terms: [{ term: 'await', meaning: 'Pauses this invocation; other searches can still run.' }],
          annotations: [{ line: 3, meaning: 'Waits independently for this response.' }, { line: 4, meaning: 'Publishes without checking freshness.' }]
        } : action === 'implement' ? { type: 'implement' } : null;
        if (!operation) throw Error('Unknown video capture action');
        const result = spawnSync(process.execPath, ['tools/fix.mjs', 'apply'], { cwd: root, env, input: JSON.stringify(operation), encoding: 'utf8' });
        if (result.status !== 0) throw Error(result.stderr);
      }).catch(error => { actionError = error; if (capture.exitCode === null) capture.kill('SIGTERM'); });
    }
  });
  capture.stdin.end(ready.url);
  const [status] = await once(capture, 'exit');
  await tasks;
  if (actionError) throw actionError;
  if (status !== 0) throw Error('Illustrated video capture failed');
  const state = JSON.parse(fs.readFileSync(path.join(temporary, 'state.json'), 'utf8'));
  if (state.stage !== 'complete' || state.baseline.failCount !== 3 || state.verification.passCount !== 4) throw Error('Executed demo evidence was not preserved.');
  const metadata = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', audio]));
  if (!metadata.streams.some(stream => stream.codec_type === 'audio')) throw Error('No narration audio stream');
  const duration = Number(metadata.format.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw Error('Invalid narration duration');
  const words = paragraphs.map(text => text.split(/\s+/).length), total = words.reduce((sum, count) => sum + count, 0);
  const seconds = words.map(count => duration * count / total);
  const quoted = value => `'${value.replaceAll("'", "'\\''")}'`;
  fs.writeFileSync(path.join(output, 'frames.txt'), seconds.map((length, index) => `file ${quoted(path.join(output, `frame-${String(index + 1).padStart(2, '0')}.png`))}\nduration ${length}`).join('\n') + `\nfile ${quoted(path.join(output, 'frame-09.png'))}`);
  const time = value => {
    const ms = Math.round(value * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
  };
  const subtitles = [];
  let elapsed = 0;
  for (let index = 0; index < paragraphs.length; index++) {
    const sentences = paragraphs[index].match(/[^.!?]+[.!?]+|[^.!?]+$/g).map(sentence => sentence.trim());
    const counts = sentences.map(sentence => sentence.split(/\s+/).length), count = counts.reduce((sum, value) => sum + value, 0);
    for (let part = 0; part < sentences.length; part++) {
      const length = seconds[index] * counts[part] / count;
      subtitles.push(`${subtitles.length + 1}\n${time(elapsed)} --> ${time(elapsed + length)}\n${sentences[part]}\n`);
      elapsed += length;
    }
  }
  const captions = path.join(output, 'captions.srt');
  fs.writeFileSync(captions, subtitles.join('\n'));
  fs.writeFileSync(path.join(output, 'narration.txt'), fs.readFileSync(script));
  const video = path.join(output, 'own-the-fix-cartesia.mp4');
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'concat', '-safe', '0', '-i', path.join(output, 'frames.txt'), '-i', audio, '-i', captions,
    '-map', '0:v:0', '-map', '1:a:0', '-map', '2:0', '-vf', 'scale=1280:720', '-r', '30',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-c:s', 'mov_text',
    '-metadata:s:s:0', 'language=eng', '-movflags', '+faststart', '-t', String(duration), video]);
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', video, '-f', 'null', '-']);
  console.log(JSON.stringify({ video, seconds: duration, bytes: fs.statSync(video).size, scenes: 9, captions: 'Estimated sentence timing; review against supplied narration.' }));
} finally {
  if (capture && capture.exitCode === null && capture.signalCode === null) { capture.kill('SIGTERM'); await once(capture, 'exit'); }
  if (server && server.exitCode === null) { server.kill('SIGTERM'); await once(server, 'exit'); }
  fs.rmSync(temporary, { recursive: true, force: true });
}
