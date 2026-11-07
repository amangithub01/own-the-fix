# Own the Fix

**Ship the fix. Keep the understanding.**

A Business Workflow submission for the Flip the Switch hackathon. A developer
and a Switch-connected coding agent collaborate on a reproducible bug without
silently handing every decision to the agent.

Inspired by [Addy Osmani's post about maintaining critical thinking in agentic workflows](https://x.com/addyosmani/status/2117512471930167377).
The project records participation and evidence; it does not diagnose, measure,
or promise to restore cognitive ability.

## The problem

An agent writes a plausible fix, tests go green, and the developer ships it.
Later someone asks "Why this approach?" and the developer cannot explain the
change, alternatives, or what the tests actually establish.

Own the Fix puts a small decision workflow between the issue and the patch:

```text
Developer hypothesis
  -> source-backed agent explanation
  -> developer prediction
  -> actual baseline evidence and alternatives
  -> developer chooses and authorizes one approach
  -> selected patch and executed tests
  -> developer explanation and test limitation
  -> decision receipt
  -> PR-ready local fix summary and automatic daily activity/learning recap
```

The state machine rejects implementation before the earlier checkpoints are
recorded. A receipt cannot be generated before the developer's final explanation.

## Scope and honest integration status

This MVP supports **one self-contained JavaScript stale-search case**, with two
prepared solution adapters. It is not an arbitrary-repository repair agent.
The coding agent provides the source explanation, coaching, evidence discussion,
and room interaction; the tool applies the selected prepared patch transparently.

Switch carries the human-agent collaboration. The browser dashboard displays
the source, checkpoints, human answers, executed output, and final receipt.
There is no separate AI API or chatbot hidden in the web app.

The dashboard also permits direct human entry as an accessibility/fallback path.
The external Discord/Switch invocation must be demonstrated separately before
claiming that it works. Local synthetic tests are not proof of that connection.

## Run locally

Requirements: Node.js 22 or newer and a browser. No runtime dependencies.
`npm start` automatically opens the browser on macOS.

```bash
npm ci --ignore-scripts
npm start
```

For other platforms, run `node server.mjs` and open its printed local URL.
That URL contains an access token: do not share it or include it in a video.

Start the case in the dashboard or through the local tool. The original source
and tests are copied into an isolated local workspace. The real baseline run
has **one passing test and three failing tests**.

## Connect the existing Switch agent

Use a private Discord channel connected to Switch. Invite an already registered
agent, for example:

```text
!invite-agent @switch-buddy-admin
```

The agent must run on the same Mac and be allowed to access this repository.
Copy `switch-room.txt` into its room instructions, adjusting the absolute project
path for your machine. Setting the agent's working directory or attaching the
repository reference does not automatically grant filesystem permission.

Start with:

> Read `/Users/priyakumari/own-the-fix/switch-room.txt` and follow it.
> Run the local context tool. Tell me the current checkpoint, without answering
> it for me or applying a fix.

Use `@agent-name` in Discord to address your agent. Complete one checkpoint at a
time. You can speak an answer with Wispr Flow, review it, and send the text.

## Why Switch is central

The room holds the instructions, developer hypotheses, agent explanations,
alternative discussions, and selected approach. The existing coding agent
executes the local tool to move the case forward. A teammate can join the room,
ask a counterargument, or review the decision evidence.

Without the Switch agent the demonstrated conversational explanation and
collaborative verification workflow are absent; only the manual evidence
dashboard remains. We do not claim that the local UI itself requires Switch
to render.

## Local tool

```bash
node tools/fix.mjs context
node tools/fix.mjs apply '{"type":"start"}'
node tools/fix.mjs receipt
```

`apply` also accepts JSON on stdin. The operations are:

- `start`
- `hypothesis` with the developer's reviewed `quote`
- `explain` with a summary, term meanings, and real source line annotations
- `prediction` with the developer's reviewed `quote`
- `choose` with `approach` and the developer's choice rationale
- `implement`
- `teachback` with the developer's explanation and `testLimit`

The developer can say "I don't know" and receive a scaffold. Their answers are
kept separate from agent explanations, rather than silently rewritten as an
answer they never gave.

**Trust boundary:** a trusted local coding agent records Discord answers through
the tool. This prototype does not cryptographically verify who authored those
words and cannot prevent a malicious agent from fabricating a quote. Room
instructions forbid that behavior, and the dashboard makes the recorded words
visible. Stages enforce ordering, not authenticity or comprehension.

## Reproducible case

Two requests start in order, then finish out of order. In the buggy implementation
every response updates the display, even when its query is no longer current.

The developer chooses between:

- **Latest-request guard:** only the most recently started request may publish.
  Older work still runs.
- **AbortController with a stale-signal check:** cancel cooperating work and
  suppress its result if it completes anyway. Cancellation alone is insufficient
  when the underlying operation ignores the signal.

Debounce is not offered as a correctness fix: it can reduce request volume but
does not guarantee completion order.

The same four tests run before and after:

1. A slower old response must not replace the latest results.
2. Sequential searches must still work.
3. A failed latest request must not make an old response current again.
4. A cancellable old request must not fail the new request.

Both prepared approaches pass all four tests. Output, command, and before/after
source are recorded. These checks do not establish production UI behavior,
loading indicators, real-network behavior, or comprehensive error handling.

## Wispr Flow side track

Wispr Flow is **user-installed dictation**, not a bundled SDK integration or
custom speech-recognition service. It can insert text into the active Copilot,
Discord, or dashboard field.

Use it genuinely during development for coding-agent prompts, room instructions,
and documentation. In the demo, dictate your hypothesis and choice rationale;
review the text before sending. The application receives text only and does
not independently verify audio, usage, or speaker identity.

Submit the real **Wispr Flow desktop app -> Insights usage scorecard screenshot**
alongside the project if entering Code with Wispr. No synthetic scorecard or
invented voice-usage claim is generated here.

## GitHub PR detection and daily learning

Install GitHub CLI (`gh`) and sign in to the intended account with
`gh auth login --hostname github.com --web`. In the dashboard's **What I did
and learned today** section, explicitly connect one `owner/repository`.
The signed-in account becomes the PR author filter. Account changes stop
successful checks rather than silently mixing another person's activity.

The local server checks on startup and every five minutes while running.
**Check PRs now** triggers the same read-only check. It fetches titles, URLs,
states, and timestamps for that author's PRs created or updated during the
current IST day. GitHub updates can include comments or bot activity; they
are not proof of new code or work performed. No PR code, diffs, bodies, or
comments are fetched; no PR is created, edited, or commented on.

Daily Markdown recaps persist under
`~/Library/Application Support/Own the Fix/daily-recaps/`, outside the
repository. They combine **separate** GitHub metadata and the developer's
completed local teach-back, choice rationale, test evidence, and identified
limitations. They never infer learning from a PR, and never automatically
claim the local demo fix belongs to a detected PR. Without a completed
teach-back, the recap explicitly says learning is not recorded.

Copy the local fix PR summary after completing the guided case, or copy/download
a daily recap. Review it before sharing. This is a metadata snapshot, not
a complete event audit or an AI-generated summary of arbitrary repository
changes. Up to 300 matches per day are paginated; incomplete/excessive
results and network/authentication failures are reported without replacing
previous successful evidence. Recaps continue collecting local learning
without GitHub configured. There is no backfill for days when the app was off.
Use a separate `OWN_FIX_DATA_DIR` to track another repository/account.

Wispr, Discord, Switch, and the configured model provider each have their own
permissions and data-processing policies. Use non-sensitive examples.

## Privacy

- Local state, isolated workspace, and `decision-receipt.md` live in
  `~/Library/Application Support/Own the Fix`, outside the public repository.
- The local server binds to `127.0.0.1`; API calls require a generated token and
  reject other hosts and origins.
- Data writes use an owner-only directory, revision checks, serialized writes,
  and atomic state replacement.
- Reading context with the agent may send your words to its AI provider.
  Discord processes messages sent through Discord.
- No employer code, credentials, voice recordings, or transcript archives are
  needed for this demonstration.

## Validation

```bash
npm run check
npm test
```

Workflow tests exercise the stage gates, real failing baseline, both selected
fixes, stale submissions, invalid citations, and the receipt prerequisite.

Native-webview UI validation is optional on a Mac with Xcode:

```bash
mkdir -p build
xcrun swiftc test/ui-smoke.swift -o build/ui-smoke \
  -framework AppKit -framework WebKit
node test/ui-smoke.mjs
```

The UI smoke uses isolated synthetic answers and a test-side CLI actor.
It does not claim to test a real Discord conversation.

## Submission demonstration

[Watch/download the Cartesia-narrated walkthrough](demo/own-the-fix-cartesia.mp4).
The video uses developer-supplied Cartesia-synthesized
narration with a clearly labelled Discord-style illustration alongside
the actual local dashboard. All human answers are samples, the selected
patch is prepared, and the baseline/fix tests execute in an isolated case.
The GitHub scene makes a real read-only check of the configured public demo
repository; the displayed daily recap is an excerpt of the saved full file.
Neither this video nor its synthetic chat proves live Discord transport or
Wispr microphone usage. The original voice audio stays outside the repository.
Script-based captions use estimated sentence timing, not forced alignment.

To regenerate with your own exported narration and the nine-paragraph script:

```bash
node tools/create-illustrated-video.mjs /path/narration.wav /path/script.txt /path/output
```

The script is in `demo/cartesia-narration.txt`; sidecar captions are in
`demo/cartesia-captions.srt` and also embedded in the MP4.

The illustrated GitHub scene currently targets `amangithub01/own-the-fix`
using the signed-in GitHub CLI account. Voice services have their own data
processing terms; this renderer only processes the exported audio locally.

`demo/own-the-fix-prototype.mp4` is a narrated snapshot walkthrough using
isolated sample answers and real local verification. Every scene is labelled:
it is **not live Discord footage or evidence of actual Wispr dictation**.
Narration is generated with macOS text-to-speech. Captions are embedded in the
MP4 and supplied separately in `demo/captions.srt`.

To regenerate the labelled walkthrough on a Mac with Xcode and FFmpeg:

```bash
node tools/create-walkthrough.mjs /absolute/path/to/output
```

The renderer uses a temporary case and does not alter your real case data.
For a stronger submission, supplement this with a real Switch/Discord clip:

Show the Discord/Switch room and dashboard together. Dictate an initial
hypothesis, obtain a grounded explanation, predict the behavior, challenge an
alternative, authorize a fix, inspect the executed tests, and explain the result
in your own words. Finish by opening the decision receipt.

Submit a public repository, a short video of the actual workflow, and this
README. Include genuine Wispr usage evidence if entering that side track.
