# DynLex website

The source for [dynlex.com](https://dynlex.com). Pages, editor behavior, games,
models, shaders and UI declarations are written in DynLex. The shared renderer
and controls come from [dynlex-ui](https://github.com/OpenAEC-Foundation/dynlex-ui).
The Studio page and reusable code editor come from [dynlex-ide](https://github.com/OpenAEC-Foundation/dynlex-ide).
The compiler and platform runtime come from [dynlex](https://github.com/OpenAEC-Foundation/dynlex).

## Build and preview

Install Python 3.10+ and Node.js 22+. No compiler checkout, C++ build or sibling
repository is needed. The build uses the pinned esbuild development dependency.

```bash
npm ci
python3 scripts/build_site.py
./scripts/view_web.sh 7000
```

For local iteration with an installed native compiler, select it explicitly:

```bash
DYNLEX_PROJECT_COMPILER=/absolute/path/to/dynlex python3 scripts/build_site.py
```

Both build paths use the package's standard library and produce Wasm. Shader
compilation uses the pinned browser compiler and shader translator.

Open http://127.0.0.1:7000/. The preview uses WebGPU when available, otherwise
WebGL2. Building does not open a window. The source map and static assets are
published into `build/site`.

## Dependencies

`site/project.json` pins content-addressed compiler, UI and IDE archives in
`site/dependencies/`. Each archive is validated against its file hashes before
extraction. The build tools, standard library, runtime, installer and logo come
from the compiler package. Farm and River vocabulary belongs to this repository
under `site/language/` and is explicitly supplied to the embedded editor.

To update a dependency, export a package from its owning repository and run:

```bash
python3 scripts/update_dependency.py /absolute/path/to/exported-package.zip
python3 scripts/build_site.py
```

The compiler exports with `scripts/package_web_compiler.py --output PATH`;
dynlex-ui and dynlex-ide export with their `scripts/export_sdk.py` commands. Updating the lock is
explicit; production builds never read a sibling checkout.

## Verification

```bash
./scripts/test_web_ui.sh
./scripts/test_web_browser.sh
```

Browser tests run muted in private Xvfb sessions. `DYNLEX_TEST_GRAPHICS` selects
`webgpu`, `webgl-no-adapter` or `webgl-no-api`; `DYNLEX_SITE_SCENARIO` selects
`general`, `farm`, `river-inspection` or `river`. Native cross-checks can use an
installed compiler executable supplied through `DYNLEX_COMPILER`; normal builds
and tests use the pinned browser compiler.
Delivery verification additionally requires nginx (`DYNLEX_NGINX` may point to an
uninstalled executable). Tests start it on a private local port, without changing
the system service. [Startup measurements](docs/startup.md) document the cold
mobile emulation and the loading sequence.

## Deployment

The deployment workflow is manually dispatched. Configure repository variables
`DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER` and secret `DEPLOY_SSH_KEY` before
running it. The existing compiler repository's private deployment key cannot be
exported through GitHub's API. A push to this repository builds and tests the site
without changing production. Deployment uploads an immutable release and switches
the current symlink atomically.

See `site/README.md`, `docs/farm.md` and `docs/game-accounts.md` for application
details. `docs/extraction.json` records the original compiler revision and moved
file inventory. Compiler regression fixes remain in the compiler repository.
