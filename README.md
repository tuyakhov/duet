# Duet 🎛️

**Record a melody, then ask your browser agent to become the rest of your band.**

Duet is a browser-based music studio shared by a human and their external WebMCP-capable agent. The human records or draws a 16-step melody that exists only in the current browser session. The agent reads that exact unsaved composition through tools exposed by the page, adds instruments, writes an accompaniment, and performs the result. The human can change notes, mute tracks, adjust the energy — and the agent immediately sees the changed live state and adapts.

> Duet turns a webpage into a shared musical instrument. A human contributes through direct manipulation while their chosen browser agent contributes through structured capabilities supplied dynamically by the same page. Neither needs to own the entire creative process.

There is **no chatbot, no embedded LLM, and no API key** in this app. You bring your own agent.

---

## Why Duet specifically requires WebMCP

A prompt-to-music generator only needs an API. Duet needs the four things only WebMCP provides:

1. **Bring your own agent.** The page contains no model. Any WebMCP-capable agent — ChatGPT's browser, Chrome's agent surface, an extension — can sit down at the same instrument.
2. **Shared live state.** The melody you just drew exists only in this tab's memory. There is no server the agent could query. `studio_get_session` is the *only* way any agent can hear what you played — and it always returns the live, unsaved session both of you are editing.
3. **Dynamic capabilities.** The exposed toolset *is* the state of the studio. Add a Drum Machine and `drums_edit` appears in the browser's tool registry; remove it and the tool is gone. Enter Performance mode and every compose tool is withdrawn, replaced by seven performance tools. The agent's capabilities track what's physically in the rack.
4. **Human intervention.** `studio_publish` pauses mid-tool-call and opens an in-page approval modal. The tool only resumes — returning the remix link or a `PUBLISH_CANCELLED` error — after the human decides. Consequential actions stay under human control.

## The human–agent interaction model

Every mutation — a human click on the piano roll, an agent `bass_edit` call — flows through the **same state engine** (`apply(actor, op)` in `src/state/store.ts`). Each one:

- validates its input (invalid steps/pitches/durations are rejected with typed error codes),
- increments the session version,
- updates the visible studio immediately,
- appends an actor-attributed entry (`HUMAN` / `AGENT` / `SYSTEM` / `PLAYBACK`) to the activity timeline,
- pulses the affected track in the actor's color (cyan = you, mint = your agent).

The audio scheduler reads the live session on every 16th-note tick, so an agent edit made during playback is audible on the very next step. The interaction feels like a duet because it is one: the same instrument, two sets of hands.

## Architecture

```
src/
├── engine/          Pure, serializable session model — no React, no audio
│   ├── types.ts     Session/composition/note/chord/pattern types
│   ├── music.ts     Pitch parsing, scales, spelling (flats vs sharps)
│   ├── validate.ts  All tool + UI input validation (typed DuetErrors)
│   ├── ops.ts       Every mutation as a pure (Composition) → OpResult fn
│   ├── session.ts   Session factory + example melody
│   └── share.ts     Versioned base64url share codec (strict re-validation)
├── state/
│   ├── store.ts     Zustand store: apply(actor, op), undo, activity,
│   │                publish approval promise, autosave
│   └── actions.ts   Human-gesture wrappers (errors → toast)
├── audio/
│   ├── engine.ts    Tone.js graph: one 16-step sequence reading live state,
│   │                energy→filter/hats/pad mapping, meters, safe disposal
│   └── presets.ts   Lead/bass/pad synth presets + drum kits
├── webmcp/
│   ├── adapter.ts   Feature-detecting wrapper over the WebMCP surfaces
│   ├── tools.ts     All tool definitions (schemas + handlers)
│   └── controller.ts Store subscription → syncTools; dev-only harness
└── components/      React UI (compose studio, performance stage, modals)
```

WebMCP handlers, human UI actions, and tests all call the same engine ops. The React layer and Tone.js scheduler are both *subscribers* to the store, never owners of state.

## Musical state model

One serializable session (see `src/engine/types.ts`):

- `sessionId`, `version` (bumps on every human/agent mutation), `mode` (`compose` | `performance`)
- `composition`: `title`, `tempo` (60–200 BPM), `key` (12 pitch classes), `scale` (8 scales), `loopLength: 16`, `instruments` (rack order), `swing` (0–0.6), `space` (reverb 0–1), and five tracks:
  - **Lead / Keys / Bass** — notes: `{ step: 0–15, pitch: "C4"|"Eb3"|…, duration: steps, velocity: 0–1 }`
  - **Drums** — four boolean[16] lanes: `kick`, `snare`, `hatClosed`, `hatOpen`
  - **Pad** — chords: `{ step, duration, pitches: ["C3","Eb3","G3"], velocity }`
  - each with `preset` and `mixer { volume, muted }`
- `energy` (0–1, performance), `playback { playing, step }`, `activity[]`, `selection`

Sharing serializes only the composition (never history or playback) into `#s=<base64url>` with a format version; malformed or incompatible payloads are rejected with a friendly error page.

## Complete tool inventory

**Compose mode — base tools (always registered in compose):**

| Tool | Purpose |
|---|---|
| `studio_get_session` | Full structured session: every note, pattern, chord, mixer, mode, recent activity |
| `studio_list_instruments` | Rack contents + what can still be added |
| `studio_add_instrument` | Add `drums` / `bass` / `pad` — its edit tool appears |
| `studio_remove_instrument` | Remove one — its edit tool disappears (lead is protected) |
| `studio_set_tempo` | 60–200 BPM, live even during playback |
| `studio_set_key` | Key and/or scale — key changes transpose all existing material by default (`transposeExisting: false` to relabel only) |
| `studio_set_groove` | Swing (off-beat 16th delay, 0–0.6) and space (global reverb send, 0–1) |
| `studio_enter_performance` | Swap the entire toolset for performance tools |
| `studio_publish` | **Pauses for in-page human approval**, then returns the remix link |

**Compose mode — instrument tools (registered only while that instrument exists):**

| Tool | Operations (one enum per schema) |
|---|---|
| `lead_edit` | `replace_notes`, `add_notes`, `patch_steps`, `remove_steps`, `set_preset`, `set_mix` |
| `keys_edit` | same operations as `lead_edit` (electric-piano track) |
| `bass_edit` | same operations as `lead_edit` |
| `drums_edit` | `replace_pattern`, `set_steps`, `clear_steps`, `set_kit`, `set_mix` |
| `pad_edit` | `replace_chords`, `add_chord`, `remove_chord`, `set_preset`, `set_mix` |

Presets: lead `neon · glass · saw · laser · chip · velvet · brass`, keys `tines · bell · organ`,
bass `warm · growl · sub · rubber · buzz`, pad `haze · strings · choir · shimmer · dark`,
drum kits `analog · punch · boom`.

**Performance mode (the only tools registered in performance):**

`performance_get_state`, `performance_play`, `performance_stop`, `performance_set_energy`, `performance_set_track_mix`, `performance_launch_breakdown`, `performance_return_to_compose`

Every response carries `ok`, `message`, `sessionVersion`, `currentMode`, `playbackState`, plus `changedTracks` / `changedSteps` / `warnings` for mutations. Errors carry typed codes (`INVALID_PITCH`, `DUPLICATE_INSTRUMENT`, `WRONG_MODE`, `AUDIO_PERMISSION_REQUIRED`, `PUBLISH_CANCELLED`, …). Tools are **mode-guarded even if a stale registration were somehow invoked**.

## Dynamic registration

`src/webmcp/adapter.ts` feature-detects the runtime:

- **`document.modelContext`** (current Chrome implementation): each tool registers with `registerTool(descriptor, { signal })`; withdrawal aborts its `AbortController`.
- **`navigator.modelContext`** (spec-proposal surface): uses `registerTool`/`unregisterTool` when present, else rebuilds the full list through `provideContext({ tools })`.

`src/webmcp/controller.ts` subscribes to the store: any change to `mode` or the instrument rack recomputes the desired toolset and diffs it against what's registered. Handlers read live state, so unchanged tool names are never churned. When a runtime passes an agent context with `requestUserInteraction`, `studio_publish` routes its approval wait through that official hook; otherwise the async handler simply awaits the in-page modal.

## Local setup

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-checks + production build to dist/
npm run preview    # serve the production build
```

No backend, no environment variables, no API keys.

## Browser / WebMCP setup

- **Chrome 149+**: open `chrome://flags/#enable-webmcp-testing`, set **Enabled**, relaunch. (Production deployments can use the [WebMCP origin trial](https://developer.chrome.com/blog/ai-webmcp-origin-trial).)
- **ChatGPT's in-app browser** or any other WebMCP-capable agent surface: just open the URL.
- The capability panel in the app tells you honestly whether a WebMCP runtime was detected. (The page cannot know whether an agent is *connected* — only what it exposes.)

## Tests

```bash
npm test           # vitest: 83 tests
```

Covered: session creation · note/drum/chord validation · instrument add/remove & duplicates · version increments · human+agent mutating the same state · undo · dynamic compose toolsets · instrument tool appearance/removal · compose↔performance tool transition · mode guards · share round-trip & malformed payloads · publish approval and cancellation · adapter sync against faithful fakes of both WebMCP surfaces (registration, unregistration, result/error normalization).

A **dev-only harness** (`window.__duetHarness`, absent from production builds) invokes the exact same tool handlers for automated end-to-end testing. It is not a fake agent and never appears in the UI.

## Running the demo

1. Open Duet in a WebMCP-enabled browser and click **Enable Audio**.
2. Draw a short melody on the Lead piano roll (or use *load an example melody*).
3. Copy the prompt from the **Ask your agent** panel into your browser agent:
   > Listen to the melody I recorded. Preserve my notes and turn it into cinematic synthwave. Add drums, bass, and atmospheric chords. Then perform it for me.
4. Watch the timeline attribute every move, and the capability panel grow as instruments land.
5. When you're happy, ask the agent to publish — approve the title in the modal and share the remix link.

## Three-minute judging script

| ⏱ | Beat |
|---|---|
| 0:00 | Click **Enable Audio**. Draw a 5–8 note melody on the Lead roll. Press play — just a lonely melody. |
| 0:30 | Point at the capability panel: *nine studio tools plus `lead_edit` — nothing else exists yet.* |
| 0:45 | Give the agent the synthwave prompt. It calls `studio_get_session` and reads the exact unsaved notes. |
| 1:00 | It adds Drums → the module slides in **and `drums_edit` appears in the panel**. Then Bass, then Pad — each instrument brings its own WebMCP capability. |
| 1:30 | It programs patterns and mixes. Every edit pulses mint and lands in the timeline as `AGENT`. |
| 1:45 | It calls `studio_enter_performance` — the room transforms, and the panel now shows **only** seven performance tools. It plays the arrangement, rides the energy, maybe drops a breakdown. |
| 2:15 | Return to Compose. Manually move two melody notes. Ask: *"Adapt the accompaniment to my changes and create a more dramatic ending."* It re-reads the session, patches bass/pad/drums around **your** notes, performs again. |
| 2:45 | Ask it to publish. **Duet pauses the tool and asks you** to approve the title. Approve → confetti → copy the remix link. *"I played the melody. My agent built the band. What will yours create?"* |

## Honest limitations

- One 16-step loop — this is an instrument for a duet, not a DAW.
- Notes are drawn/deleted/redrawn on the grid; there's no drag-to-move or tail-resize of an existing note (drag while drawing sets its length).
- Level meters and the breakdown timer are approximations tuned for the demo, not metering-grade.
- The capability panel reports runtime detection only; WebMCP gives a page no way to know whether an agent is actually attached.
- The share URL carries the whole composition (~1–2 KB base64) — fine for links, but it is visible data, not a private upload.
- Undo covers composition edits; mode switches, playback and timeline entries are deliberately not undoable.

## Future possibilities

- **WebMIDI input** — play the melody on a hardware keyboard (the on-screen flow already covers the full demo).
- More loops/patterns and song arrangement; more instruments (arp, FX sends).
- An `elicitation`-style tool for the agent to *ask* the human a musical question mid-arrangement.
- Per-note agent "suggestions" the human can accept/reject in place.
- Rendering the loop to WAV for export.

---

Built for the WebMCP Challenge. MIT licensed.
