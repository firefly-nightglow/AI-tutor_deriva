# External Window Geometry Spike

This experiment determines whether Deriva can safely arrange a selected external learning window and restore its original state. It is not imported by the production application. The governing task is [Task 0021](../../doc/tasks/0021-external-app-tiling-spike.md); the four-source receipt is [GROUND-0016](../../doc/research/0016-ground-external-app-tiling.md).

## Discovery

Selection criterion: smallest independently testable native surface that works in Electron and a packaged Windows x64 app without requiring a compiler on the user's machine.

| Candidate | Benefit | Cost | Decision |
| --- | --- | --- | --- |
| Koffi 3.3.3 + Win32 | Official prebuilds, C declarations from JS, no custom binary implementation | FFI signatures and split native packages require runtime/package verification | First candidate; owner confirmed |
| Custom Node-API addon | Typed native boundary and direct control of callbacks | Own C++/build/prebuild/signing/update lifecycle | Reserve if FFI fails a gate |
| PowerShell P/Invoke helper | Useful independent fixture host | Extra process/serialization costs; unsuitable for repeated interactive resizing | Fixture only, not production control |

Official contracts, fetched FancyZones source and local analogs are registered in GROUND-0016. No prior native tiling attempt exists in git. Focus is API/packaging reliability, not AI, screen capture or UI design.

## Safety and Gates

1. Load bindings and enumerate metadata without logging window titles or full process paths.
2. Identify a dedicated fixture in a different process; save placement before any geometry operation.
3. Tile left/right, adjust the boundary, read actual visible bounds, restore and verify; restore in finally on failure.
4. Validate stale identity, disappearing windows, minimum-size refusal and bounded calls without claiming real elevated-window coverage from mocks.
5. Run through Electron and a separate packaged executable. Physical DPI/multi-monitor and three named apps require separate HITL evidence.

Automatic runs may only mutate windows created by this experiment. A manual target requires an explicit window identity and confirmation. No elevation, input simulation, DOM inspection, content capture, model requests or production data access.

`fixtures/` defines expectations before execution. `pipeline/` contains stage implementations; `debug/` records redacted stage output; `eval/results.json` records per-stage and end-to-end outcomes including unverified hardware gates. Native packages and build products remain in ignored paths. The experiment remains available while HITL gates are open; conclusion is recorded in ADR-0006 before promotion or deletion.

The first run exposed a fixture-host unit mismatch: its minimum width was passed as DIP despite the physical-pixel contract, making the original window wider than the display and preventing exact placement restoration. The host now converts the explicitly named `minimumWidthPx` to DIP; the 2200 physical-pixel expectation and refusal contract are unchanged. The initial failure is retained in `debug/initial-fixture-failure.json`, not counted as a successful run. This is not evidence that arbitrary oversized user windows can always be restored.
