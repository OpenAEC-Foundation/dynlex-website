#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
if [[ -z "${DYNLEX_BROWSER_TEST_ENTRY:-}" ]]; then
    for dependency in node google-chrome xvfb-run Xvfb; do
        if ! command -v "$dependency" >/dev/null 2>&1; then
            echo "Missing required dependency: $dependency"
            exit 1
        fi
    done
    root="${DYNLEX_TEST_WEB_ROOT:-$PROJECT_DIR/build/site}"
    if [[ ! -f "$root/index.html" ]]; then
        echo "Build the DynLex website first: $PROJECT_DIR/scripts/build_web_root.sh"
        exit 1
    fi
    modes=(webgpu webgl-no-adapter webgl-no-api)
    case "${DYNLEX_TEST_GRAPHICS:-}" in
        '') ;;
        webgpu|webgl-no-adapter|webgl-no-api) modes=("$DYNLEX_TEST_GRAPHICS") ;;
        webgl) modes=(webgl-no-adapter) ;;
        *) echo "Unknown graphics test mode: $DYNLEX_TEST_GRAPHICS"; exit 1 ;;
    esac
    scenarios=(general project debugger studio-layout farm river-inspection river)
    if [[ -n "${DYNLEX_SITE_SCENARIO:-}" ]]; then
        case "$DYNLEX_SITE_SCENARIO" in
            general|project|debugger|studio-layout|farm|river-inspection|river|context-recovery) scenarios=("$DYNLEX_SITE_SCENARIO") ;;
            *) echo "Unknown website scenario: $DYNLEX_SITE_SCENARIO"; exit 1 ;;
        esac
    fi
    cd "$PROJECT_DIR"
    for mode in "${modes[@]}"; do
        for scenario in "${scenarios[@]}"; do
            entry=site_browser.mjs
            if [[ "$scenario" == river ]]; then entry=site_river_browser.mjs; fi
            env -u WAYLAND_DISPLAY -u WAYLAND_SOCKET -u VK_DRIVER_FILES -u VK_ICD_FILENAMES \
                DYNLEX_BACKGROUND_BROWSER=1 XDG_SESSION_TYPE=x11 DYNLEX_SITE_SCENARIO="$scenario" \
                xvfb-run -a -s "-screen 0 1400x1000x24" \
                node "$PROJECT_DIR/tests/web/$entry" "$root" "$mode" "${DYNLEX_TEST_WEB_BASE:-/}"
        done
    done
    exit 0
fi
compiler_root="$(python3 "$PROJECT_DIR/scripts/dependencies.py")"
exec bash "$compiler_root/scripts/test_web_browser.sh"
