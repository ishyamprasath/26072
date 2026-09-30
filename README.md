# Thunderstorm and lightning nowcasting prototype

Working plan for the prototype. This file is the spec: the problem, every requirement, how each one is met, and the build phases.

## The problem, in plain language

A thunderstorm builds, moves, and dies within about one or two hours. A normal weather forecast is for a large area and for later today or tomorrow, so it cannot say what a district will face at 4:30 if it is 3:00 now. In India that gap matters. Lightning kills a large number of people every year, many of them working outdoors, with little time to act.

**Nowcasting** is the forecast for that short gap: from now out to two hours, updated from the latest observations as they arrive.

The usual method is to watch which way the clouds are moving and slide the current picture forward. That is called **optical-flow advection**. It works while a storm keeps the same shape and speed. It cannot start a storm in clear air, grow a small storm into a large one, or remove a storm that is dying. **Persistence** is simpler still: it assumes the storm stays exactly where it is.

The system has to learn those changes from a sequence of observations, then put a probability on every cell of a fixed map, every 10 minutes, for the next two hours. One map is thunderstorm activity. A second map is lightning likelihood, drawn where flash observations exist to support it.

It is judged the way nowcasts are judged, at each lead time, against both baselines:

- **POD** (probability of detection): of the cells that really were stormy, how many the forecast caught.
- **FAR** (false alarm ratio): of the cells the forecast marked, how many were false.
- **CSI** (critical success index): one number that drops for both misses and false alarms. 1 is a perfect map. 0 means the forecast never helped.

The demo that matters is one convective afternoon the model never trained on, played as a two-hour loop beside what actually happened, with CSI against the optical-flow baseline shown at every lead time.

Around that forecast, the same app has to explain what to do, talk, listen, and be usable from a phone.

## Requirements

These are the requirements for this prototype. The build is finished only when every row is true.

### Forecast

| # | Requirement | How this prototype meets it |
|---|---|---|
| F1 | AIML nowcast of thunderstorm and lightning from atmospheric observations | A one-hidden-layer network learns a storm probability at each lead from the recent infrared and water-vapour values, the local cooling, and the optical-flow slide. Persistence and optical flow are the baselines, not the forecast. |
| F2 | Observations include satellite, multiple radars, lightning, and model data | Satellite infrared and water vapour are the fields that are actually read. Radar is one composite reflectivity channel (the mosaic of whatever radars cover the cell) plus a coverage mask. Lightning is a flash-count channel plus a mask. Model data is one optional field, such as CAPE, plus a mask. In this build the three optional channels are zero and the masks are zero, because no radar, flash, or model archive is pulled. The tensors, the loaders, and the legend already have the slots. |
| F3 | Zero-to-two-hour forecasts of convective activity | Twelve leads: +10, +20, …, +120 minutes, from one forward pass. |
| F4 | A defined region on a fixed grid | 20°N to 28°N, 84°E to 96°E (eastern Bihar and Uttar Pradesh, Jharkhand, Bengal, Odisha, western edge of the Northeast). The grid is the unique Himawari full-disk pixels inside that box. India is far from the satellite nadir, so those pixels are coarse and a 0.05° lattice would only repeat the same measurement. Training, baselines, scores, and the map share those pixels. The page prints how many there are and how large each block is. |
| F5 | Learn initiation, growth, decay, and motion from a sequence of satellite infrared and water-vapour imagery, and from radar reflectivity where it is accessible | Input is the previous 60 minutes (6 frames) of infrared (10.4 µm) and water vapour (6.2 µm), the infrared cooling over 30 minutes, and the radar channel where its mask is 1. |
| F6 | Learn that evolution rather than only sliding the current field forward | The optical-flow slide is an input. The network’s output is a probability, so it can raise probability on clear cells (initiation), strengthen a cell (growth), or drop it (decay). |
| F7 | A gridded probability of thunderstorm activity at each time step | One sigmoid output per lead. A cell is stormy, for scoring, when infrared brightness temperature is at or below 240 K. 230 K does not occur in this footprint. The page states that rule. Where a radar mask is 1, the label would become reflectivity at or above 35 dBZ. That mask is off in this build. |
| F8 | A separate lightning-likelihood layer where observation data supports it | A second sigmoid head and a separate map layer. The loss is applied only where the lightning mask is 1. With the mask at zero, the layer is on the page, it explains that this case has no flash observations, and no lightning score is claimed. |
| F9 | POD, FAR, and CSI at each lead time | Same formulas for every method and every lead from +10 to +120 minutes, on all cells, on initiation, and on decay. |
| F10 | A persistence baseline and an optical-flow advection baseline that is genuinely hard to beat | Persistence repeats the analysis mask. Optical flow is Horn-Schunck motion between the last two infrared frames, limited to 2 pixels per 10 minute step, then a semi-Lagrangian slide of the mask. Same label, same pixels. Short leads are allowed to favour optical flow. That result is kept and shown. |

### Demo

| # | Requirement | How this prototype meets it |
|---|---|---|
| D1 | Run on a held-out convective afternoon | One afternoon is frozen before training. It is not in the train, validation, or test afternoons. The page shows the date. |
| D2 | Play the two-hour forecast loop beside what actually happened | Three panels: observed storm mask, model probability, optical-flow forecast. A scrubber and a play control move all three together. |
| D3 | CSI against the advection baseline at each lead time | The chart under the maps plots CSI for the model, persistence, and optical flow. The strip at the current lead also shows POD and FAR. The initiation slice is on the same chart. |

### Product

| # | Requirement | How this prototype meets it |
|---|---|---|
| P1 | Strategic intelligence: scrape the public web, and a RAG agent that states strategies | Public pages are fetched once (NDMA thunderstorm and lightning guidance, IMD’s public nowcast explanation, and public notes for farming and outdoor work, schools, electricity and railways, and district disaster operations). Chunks are stored with URL and date and searched locally. The agent may call forecast, score, district, and retrieval tools. The strategy card quotes only those tool results and cites the source URL. It does not browse during a question, and it does not log into non-public systems. |
| P2 | A chat interface | A drawer on the player. Answers stream from the same agent. Suggested prompts cover initiation, CSI versus advection, and what a district officer should do. The chat can zoom the map or change the lead. It does not invent a second forecast. |
| P3 | A voice interface that controls the app the way the UI does | Speech emits the same command JSON as the buttons. “Show 60 minutes”, “play”, “Ranchi”, “Hindi”, and the Hindi equivalents move the page. Anything else is a chat question. The screen updates before the spoken reply. |
| P4 | Remote: operate the app from a mobile phone, from anywhere | One web app. On a phone it is the full player, chat, and voice. It can also join a display room by QR code and drive the jury screen. Both need the API on a public HTTPS address, so a phone on another network can reach it. There is no native app and no account. |
| P5 | Multilingual | English and Hindi ship in the interface, the chat, the strategy card, and speech. District names come from a gazetteer (`Ranchi` / `रांची`). Another language is a new string catalogue plus a speech locale, with no change to the forecast. |

### Data constraint

| # | Requirement | How this prototype meets it |
|---|---|---|
| C1 | No packaged dataset to find, buy, register for, or commit | No Kaggle dump, no MOSDAC account, no IMD archive, no lightning archive in the repo. |
| C2 | Real satellite images, so the scores compare a forecast with what happened | A script reads twelve pre-monsoon afternoons of Himawari-9 band 13 (10.4 µm) and band 8 (6.2 µm) from the public AWS bucket `noaa-himawari9`, samples the domain pixels, and writes a gitignored folder. That is the only weather pull. |
| C3 | The jury player runs without staying online | After `data/case/meta.json` and the lead files are written, the loop and the score chart load from those files. |

The twelve afternoons are split by whole day: 8 train, 2 validation (the probability threshold is chosen here), 1 test (the score table), 1 demo (the loop). Frames from the same storm never sit on both sides of a split.

A cold cloud top at or below 240 K is the thunderstorm label this build can actually score. 230 K never occurs in the Himawari pixels over this domain. The 240 K label still includes some thick anvil that is no longer a growing core. The decay slice exists so that weakness is visible. Radar at 35 dBZ replaces the label only on cells whose radar mask is 1.

Every screen states that this is a research prototype for situational awareness. It is not an India Meteorological Department warning.

## What the system is

```
public Himawari infrared + water vapour
        │  script, twelve afternoons, fixed grid
        ▼
last hour of images
+ optical-flow slide of the current storm
+ radar, lightning, model field (zero until a mask is 1)
        │
        ▼
neural net, one probability per lead
        ├── thunderstorm probability at +10 to +120 min
        └── lightning layer on the page, not scored (no flash observations)
        │
        ├── persistence and optical flow on the same grid
        ▼
POD, FAR, CSI at each lead
        ▼
one case file for the held-out afternoon
        │
        ├── map player (three loops + score chart)
        ├── strategy agent (local retrieval + forecast tools)
        │     └── chat
        └── command bus  ←  buttons, voice, phone
```

## Forecast detail

### Inputs

| Channel | Role in this build |
|---|---|
| Infrared brightness temperature | Cloud-top temperature. Required. |
| Water-vapour brightness temperature | Moisture aloft. Required. |
| Infrared change over the last 30 min | Cooling, a sign a storm is starting. Computed. |
| Radar composite reflectivity | Mosaic of radars covering the cell. Slot stays 0. |
| Lightning counts in the last 10 min | Slot stays 0. |
| One model field (CAPE when a file exists) | Slot stays 0. |
| Elevation | Always on. Hills help storms form. |
| Sine and cosine of the local hour | Always on. Storms prefer the afternoon. |
| Optical-flow storm mask at that lead | The motion forecast the network is allowed to correct. |

### Scores

For a threshold chosen on the two validation afternoons (searched from 0.2 to 0.7, then frozen):

- POD = hits / (hits + misses)
- FAR = false alarms / (hits + false alarms)
- CSI = hits / (hits + misses + false alarms)

Slices, same formulas:

- **All storm cells.** This is the headline curve.
- **Initiation.** Clear at analysis time, stormy at that lead. Persistence has no hit. Optical flow has a hit only when the smear happens to land on the new cell.
- **Decay.** Stormy at analysis time, clear at that lead. A pure slide tends to keep the storm.

A 3-cell neighbourhood CSI may be printed as a footnote. The chart uses the strict cell score. Lead 0 is the analysis. Persistence CSI there is 1. The chart starts at +10 minutes.

Lightning POD, FAR, and CSI use the same definitions inside the lightning mask only. With the mask empty, those numbers are not produced.

### Training

Loss is weighted binary cross-entropy, because storm cells are rare. There is no lightning head to train while the flash mask is empty. The probability threshold is the value from 0.2 to 0.7 with the best mean CSI on the two validation afternoons, then it is frozen. Training is 30 epochs on the laptop. The scored grid is the handful of real Himawari pixels, so it does not need a GPU.

### Case file

`data/case/meta.json` plus `model.f32`, `flow.u8`, `persist.u8`, `obs.u8`, and `ir.f32` hold the held-out afternoon from the 08:30 UTC analysis: observed storm mask, model probabilities, persistence, optical flow, infrared brightness temperature, the score tables, and the threshold. There is no lightning field in the file.

## Product detail

### Map player (D1–D3)

MapLibre, locked to the domain. Overlays are the grid cells, georeferenced.

Controls, also available to voice and the phone:

- play or pause the two-hour loop
- scrub the lead time
- show or hide the observed mask, the model probability, optical flow, infrared, and lightning
- switch the right-hand panel between optical flow and persistence
- zoom to a district

The lightning control stays visible. On this case it explains that no flash observations were used, and it does not draw a pretend lightning field.

### Strategic intelligence (P1)

The agent answers “what should people do with this forecast.”

Saved once, with URL and retrieval date:

- NDMA public guidance on thunderstorm and lightning safety and action planning
- IMD’s public explanation of nowcast products
- public sector notes: outdoor work and farming, schools and gatherings, electricity and railways, district disaster operations

Pages that fail a fetch are skipped and listed. Firecrawl (`FIRECRAWL_API_KEY`, `https://api.firecrawl.dev/v1/scrape` and `/v1/search`) reads only `ndma.gov.in` and `imd.gov.in`, including their subdomains. When Firecrawl's proxy cannot open an allowlisted page, that same URL is fetched directly. PDF text is limited to the first 12 pages. Chunks and their embeddings live in `data/corpus/index.json` and are searched locally.

Tools the agent may call:

- `forecast_at(district or box, lead_min)` → max and mean thunderstorm probability, area above the threshold, whether the lightning mask is on
- `scores_at(lead_min)` → POD, FAR, CSI for the model, persistence, and optical flow, on the test afternoon and on this case
- `exposed_districts(lead_min, threshold)` → districts whose polygon intersects cells above the threshold, with area
- `retrieve_guidance(query, sector)` → chunks with title and URL

The strategy card shows:

- analysis time and lead time
- districts over the threshold, with probability and area
- a confidence line quoting test-afternoon CSI, POD, and FAR at that lead, and the gap versus optical flow
- actions by sector, each with the source title and URL
- a limit line: cold-cloud label, prototype, this afternoon versus the test afternoon

NVIDIA chat (`NVIDIA_API_KEY`, `NVIDIA_MODEL_RAG` or `NVIDIA_MODEL_TEXT`, `https://integrate.api.nvidia.com/v1/chat/completions`) only phrases those tool results. Temperature stays low. Embeddings use `NVIDIA_MODEL_EMBED` (`nvidia/nemotron-3-embed-1b`) with `input_type` `passage` when the index is built and `query` when a question is asked. A reply that cites a URL outside the retrieved pages, or a decimal that is not in the tool JSON, is replaced by the template. The same template is used when the chat call fails, so the card still shows the real forecast numbers. `NVIDIA_MODEL_3D` is not used.

### Chat (P2)

Suggested prompts:

- “Where is a new storm likely by 15:30?”
- “CSI at 90 minutes versus advection”
- “What should a district officer in Ranchi do in the next hour?”

### Voice (P3)

```json
{ "op": "set_lead", "minutes": 60 }
{ "op": "toggle_layer", "layer": "lightning", "on": true }
{ "op": "play" }
{ "op": "compare", "baseline": "optical_flow" }
{ "op": "zoom_district", "name": "Ranchi" }
{ "op": "set_language", "code": "hi" }
{ "op": "ask", "text": "what should farmers do in the next hour" }
```

The browser speech API (`en-IN`, `hi-IN`) hears the phrase. A grammar maps “show 60 minutes”, “play”, “Ranchi”, “बिजली की परत दिखाओ”, and “हिंदी” onto commands. Anything else becomes `ask`. The spoken reply is one sentence in the active language. Every command also has a button, so a dead microphone does not block the demo.

### Phone, from anywhere (P4)

- **Open the app** on the phone: player, chat, and voice in a narrow layout.
- **Drive the jury screen:** the display opens a room and shows a QR code. The phone joins `/remote?room=<id>` and the two screens share the view by polling. The phone shows the same player.

Rooms live in memory, use a short unguessable id, and expire after a few hours. The microphone requires HTTPS.

### English and Hindi (P5)

String catalogues for the shell. The active language is a command, so voice and the phone can switch it. The agent answers in that language, keeps the abbreviations POD, FAR, and CSI, and keeps numbers as digits. Guidance stays in the language of the source page. Action lines are written in the active language and still carry the original title and URL.

## Repository

```
app/                   Next.js pages: player, scores, strategy, display, phone
app/api/               case, panel, chat, strategy, room, qr, corpus, status
lib/                   HSD reader, sensor grid, flow, scores, model, pipeline, NVIDIA, Firecrawl
scripts/               probe, smoke, pipeline, corpus, API check
tests/                 scores, flow, model, commands, HSD, split, PNG, citation guard
data/                  gitignored
  raw/                 decompressed Himawari segments
  cubes/               domain samples for each afternoon
  corpus/              public guidance pages and embeddings
  case/                held-out afternoon the player reads
```

Next.js 15, React 19, TypeScript. No Python. The dev server and the production server use port 8787. Secrets stay in `.env` and are never sent to the browser.

## Phases

Each phase ends with something a person can run. Later phases do not change the score definition. The requirement ids are the ones in the tables above.

**Phase 1 — Grid, satellite pull, labels.** Covers F4, F5, F7, C1, C2.

The script samples the twelve afternoons of Himawari band 13 and band 8 on the satellite pixels, writes the 240 K masks, and leaves radar, lightning, and model channels unused. Exit: it prints the stormy-cell fraction for each afternoon.

**Phase 2 — Baselines and scores.** Covers F9, F10.

Persistence and optical flow run on those masks before any network exists. Exit: the score tests pass, and a table shows persistence CSI equal to 1 at analysis time and optical-flow CSI falling as the lead grows. This table is the bar the model has to clear.

**Phase 3 — Model and the held-out case.** Covers F1, F3, F6, F8, D1.

Train the network. Write POD, FAR, and CSI for the test afternoon beside both baselines, for all cells, initiation, and decay. Export the frozen demo afternoon. Exit: the score file exists. The initiation slice at +60 to +120 minutes is where the model should beat both baselines. If all-cell CSI still trails optical flow inside +30 minutes, keep that result and show it.

**Phase 4 — Player.** Covers D2, D3, C3.

Three panels, scrubber, score chart, the 240 K rule, the held-out date, and the lightning control in its empty state. Runs from the case file alone. Exit: in a browser, play the two-hour loop, scrub to +90 minutes, and read CSI for the model, persistence, and optical flow. Check the same page at phone width.

**Phase 5 — Strategy agent, chat, languages.** Covers P1, P2, P5.

Save the public guidance pages, index them locally, implement the four tools, render the strategy card, add the chat drawer, and add the English and Hindi catalogues. Exit: a Ranchi question uses only districts and probabilities present in the case file, every action has a URL, and switching to Hindi re-renders the shell and the next answer.

**Phase 6 — Voice and phone remote.** Covers P3, P4.

Wire the command schema to the player. Add the English and Hindi grammar. Add the display room, the QR code, and the phone layout. Exit: saying “show 60 minutes” moves the scrubber; asking for lightning explains that the layer has no observations; a phone on the same app changes the lead time on the display; the phone layout works on a narrow screen. Repeat the spoken path in Hindi.

## Jury sequence (about four minutes)

1. State the task in one sentence: where the storm will be for the next two hours, scored by CSI against persistence and optical flow.
2. Play the held-out afternoon. Pause on a cell that is clear at the start and stormy an hour later. Optical flow is empty there. The model probability has risen.
3. Leave the chart up. Read +30, +60, and +120 minutes for all three methods, all cells and initiation. If advection still wins at a short lead, say so.
4. By voice, in Hindi, ask for the district and the one-hour actions for farmers. The map zooms. The card cites a public page and quotes CSI at that lead.
5. From a phone, change the lead on the wall display.

## Limits to say out loud if they show up

- Himawari sees this region at a steep angle, so pixels are coarser than the 2 km figure at the satellite’s nadir, and high cloud is shifted by parallax. The domain starts at 84°E for that reason.
- Twelve afternoons can show the method. They are a thin sample. The chart is the result for those afternoons.
- Optical flow will often win or tie at +10 and +20 minutes on all cells. The lead to discuss is +60 minutes and beyond, and the initiation slice.
- Radar, lightning, and model fields are wired and masked off. Lightning skill is not claimed. The 35 dBZ label is not in the scores until a radar mask is actually 1.
- The strategy text is decision support with links to public guidance. It is not a warning.
- Voice and the phone remote need HTTPS and a reachable API. The player and the score chart load from the case file.

## Done

A reviewer can do all of the following without a spoken rescue:

- play the held-out two-hour loop beside what the satellite showed and beside optical flow
- read POD, FAR, and CSI at each lead for the model, persistence, and optical flow, including the initiation slice
- see the lightning layer present and clearly empty of claimed skill
- open a strategy card whose probabilities match the grid and whose actions cite a scraped public page
- ask the same question in the chat
- switch the interface between English and Hindi
- move the display from a phone and with a spoken command that does what the buttons do

The afternoon list, the threshold, and the 240 K rule sit next to the score table so the scores can be reproduced from the local crops.

## Run

```
npm install
npm test
npm run pipeline
npm run corpus
npm run dev
```

`npm run dev` serves http://localhost:8787. `PORT` in `.env` is 8787.

APIs this build calls:

| API | Key in `.env` | What it is for |
|---|---|---|
| Himawari-9 on AWS, bucket `noaa-himawari9` | none | Infrared band 13 and water vapour band 8 |
| Open-Meteo elevation | none | Elevation at each satellite pixel. If it fails, elevation is zero and the page says so |
| NVIDIA chat completions | `NVIDIA_API_KEY`, model `NVIDIA_MODEL_RAG` or `NVIDIA_MODEL_TEXT` | Phrases the strategy card and the chat from tool results |
| NVIDIA embeddings | `NVIDIA_API_KEY`, model `NVIDIA_MODEL_EMBED` | Local search of the guidance pages. Passage vectors when indexing, query vectors when asking |
| Firecrawl scrape and search | `FIRECRAWL_API_KEY` | Public NDMA and IMD pages only |
| Browser speech | none | English (`en-IN`) and Hindi (`hi-IN`), same commands as the buttons |
| OpenStreetMap basemap | none | The map under the forecast panels (open, free, no watermark) |

Not used: `NVIDIA_MODEL_3D`, any xAI key, MOSDAC, IMD login, a map token, a packaged dataset.

`npm run check-apis` calls chat, embeddings, and one allowed scrape, and prints status only. It does not print key values.
