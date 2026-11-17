# Startup delivery

The build compiles the application to WebAssembly. Starting the site does not
compile DynLex source or download the editor compiler. The browser compiles the
delivered Wasm machine-code module as part of its ordinary loading process.

The route shells preload the application module and three compressed font files
providing four logical faces. Inter regular and semibold share one variable font.
The platform transport is bundled into one module. Application streaming
compilation, runtime preparation, font loading and first GPU surface preparation
overlap. Font delivery preserves the native faces' Unicode coverage and advance
metrics. Optional Wasm debug names are delivered separately as `.wasm.names`.

The shared UI creates the document tree, batches initial controller setup, then
measures the final initial state. It measures active pages and selected view/tab
bodies. Layout records its own revision and viewport dimensions, so an explicit
reflow is reused by subsequent update and paint operations. Rounded geometry
outside the clip is culled before tessellation; text wrapping measures complete
lines and word boundaries rather than every character prefix.

The homepage prepares its visible shader. Following scenes are prefetched near
the transition; a requested replacement keeps the current scene visible until it
is ready. WebGL program preparation polls nonblocking driver completion, when
the driver exposes it, without occupying the UI event loop. Farm scene resources,
sound, release information, Firebase and the editor compiler load through their
existing asynchronous services when needed. Shared source workspaces start
language analysis for focused or visible editors, including the IDE and games.

The build produces Brotli and gzip representations. Preview and production nginx
delivery negotiate these representations while preserving MIME types, HEAD
semantics and cache policy. Production release paths are immutable; unversioned
navigation is revalidated. `Clear-Site-Data` is not sent on preview navigations.

## Reproduce the cold-start measurement

Build the site and run from the repository root:

```bash
DYNLEX_BROWSER_TEST_ENTRY="$PWD/tests/web/site_startup_browser.mjs" \
DYNLEX_TEST_WEB_ROOT="$PWD/build/site" \
DYNLEX_TEST_GRAPHICS=webgl \
DYNLEX_STARTUP_NETWORK=1 \
DYNLEX_STARTUP_CPU=4 \
DYNLEX_STARTUP_BUDGET_MS=1000 \
./scripts/test_web_browser.sh
```

This uses a private muted headless Chrome profile, disables its cache, selects a
390×844 viewport at device scale 2, throttles CPU by 4 and emulates 9 Mbps download,
2 Mbps upload and 40 ms latency. The measurement starts at navigation and ends at
the first UI submission exposing usable navigation. It then clicks the rendered
Docs link and checks navigation while other assets may still be pending. It also
asserts that this flow has not downloaded the optional compiler. Evidence is
written to `.cache/startup-baseline.json`; set `DYNLEX_STARTUP_OUTPUT` to retain
separate samples. Set `DYNLEX_STARTUP_SAVED=1` to include the existing Farm save
fixture, or `DYNLEX_STARTUP_CPU_PROFILE=1` for a CPU profile.

Timing is an emulation on the test machine, not a measurement of a physical phone
or the time its display scans out a GPU frame. Network and device limits still
apply. The original cold first submission took 10,653.5 ms under this test.

On 2026-11-17 the final application build produced cold first submissions of
1,001.8 and 902.8 ms with empty storage, and 985.2 ms with the existing Farm-save fixture.
Each sample used a new private browser profile with its HTTP cache disabled.
Seven startup resources completed before the first submission, totaling 654,102
compressed response bytes. The editor compiler was not requested. These results
are around the one-second target; the slowest sample was 1.8 ms over it.

Fixes include the bundled runtime's hidden import paths, duplicate document
reflows, inactive-body measurement, selected-body activation before measurement,
eager editor analysis, repeated shader requests, blank scene replacement during
loading, and preview cache-clearing delays. Focus remains independent of rendering;
input dispatch prepares layout after application observers and before processing
geometry-dependent events, so newly revealed controls accept queued input.
Compiler C++ behavior was unchanged in this work. Source workspaces, layout and
font handling are shared library changes rather than website-specific copies.

The measurements and build provenance are recorded in
[`startup-measurements.json`](startup-measurements.json). The final CI artifact's
1,058 files were compared by SHA-256 with the measured build; every file matched.
Local validation passed all 258 native UI checks at O0/O2, browser font advance
and raster-weight checks, the WebGL and WebGPU IDE flows, and the WebGL
River and Farm interaction flows. Those game checks include lazy compiler startup, shared
editor features, saved progress, execution controls and weather transitions.
The complete standalone website suite passed in
[CI run 44166891189](https://github.com/OpenAEC-Foundation/dynlex-website/actions/runs/44166891189),
including controller/model fixtures compiled with the shipped browser compiler.
Its runner keeps that compiler warm while verifying each completed fixture,
and cancels the compiler if verification fails; compilation budgets and fixture
assertions are unchanged.

The deterministic delivery tests run against the actual generated nginx rules
and Python preview handler. Tests require nginx, or `DYNLEX_NGINX` pointing to a
standalone executable; no system service needs to be started.

The Inter delivery font comes from Inter 4.001, the same version as the native
faces, pinned in `scripts/prepare_inter.py`. Its optical size is 14 and its weight
range is 400–600. Glyph debug names are removed while retaining all glyphs,
encoded characters and OpenType layout features. The existing
Inter OFL notice covers it. Regeneration requires
`fonttools[woff]==4.68.0`; ordinary site builds use the committed WOFF2 asset.
