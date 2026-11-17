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

The deterministic delivery tests run against the actual generated nginx rules
and Python preview handler. Tests require nginx, or `DYNLEX_NGINX` pointing to a
standalone executable; no system service needs to be started.

The Inter delivery font comes from Inter 4.001, the same version as the native
faces, pinned in `scripts/prepare_inter.py`. Its optical size is 14 and its weight
range is 400–600. The existing Inter OFL notice covers it. Regeneration requires
`fonttools[woff]==4.68.0`; ordinary site builds use the committed WOFF2 asset.
