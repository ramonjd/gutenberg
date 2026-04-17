# Roadmap

Follow-up work and future phases for the image editor. These are not blockers for the MVP — they're captured here so we don't lose track.

## Phase 1 — API refinements

### Hide `dispatch` and `CropperAction` from the public API

**Why:** The reducer pattern is the right internal implementation (it centralizes the containment invariant and handles compound actions like `SETTLE_CROP` and `SET_ZOOM_AT_POINT`), but it leaks into the public API. Consumers get a `dispatch` function and a `CropperAction` type they rarely need — every common action already has a convenience setter.

**Proposed shape:**

```tsx
// Hook returns a controller object, no dispatch exposed.
const cropper = useCropperState();
// cropper.state, cropper.setZoom, cropper.snapRotate90, cropper.reset, etc.

// Cropper takes the controller as a single prop.
<Cropper src={ url } controller={ cropper } />
```

**Trade-offs:**

- Cleaner API surface (removes `dispatch` and `CropperAction` from public exports).
- Breaking change — all call sites update.
- `<Cropper>` needs access to the internal `dispatch` for interactions; the controller object can expose it via a non-enumerable property, a symbol, or a separate internal hook pattern.

### Consider exposing `settle()` as a first-class method

`SETTLE_CROP` is currently only triggerable via `dispatch`. It's an internal mechanic, but could be useful for consumers building custom resize controls.

## Phase 2 — Framework-agnostic consumers

### Promote core to public API if a real non-React consumer materializes

The `core/` layer (cropperReducer, InteractionController, computeTransformStyle, stencil math) is zero-dependency pure code. It's currently **not** exported publicly — tree-shaking means React-only consumers never bundle it, but non-React consumers can't use it either.

**Trigger to promote:** A concrete use case emerges (Vue integration, vanilla JS integration, server-side pipeline). At that point, decide whether to add these to the public barrel.

**Alternative:** Split into `@wordpress/image-editor-core` and `@wordpress/image-editor-react` as separate packages when there's real demand.

## Phase 3 — Media editor expansion

### Video editing

The package is named `@wordpress/media-editor` but currently only supports images. Adding video would require:

- Video frame extraction via `<VideoCropper>` wrapper (feed a frame through `applyToCanvas`).
- FFmpeg flag generator from `getSourceRegion()` for server-side transcoding.
- Eventually, client-side WebCodecs integration for in-browser video processing.

See `docs/planning/video-roadmap.md` in the git history for earlier thinking.

### AI integration

The pipeline API (`TransformOperation[]`) is intentionally JSON-serializable for AI agent control:

- Auto-crop suggestions from image subject detection.
- Auto-straighten from horizon detection.
- Smart resize that preserves important content when aspect ratio changes.

These are consumer-side features built on the existing pipeline API. No core changes needed.

## Phase 4 — Package distribution

### Decide the final package boundary

The cropper currently lives inside `@wordpress/media-editor` as an internal module. Options for broader distribution:

- **Subpath export:** `@wordpress/media-editor/image-editor` — explicit subpath for consumers who only want the cropper.
- **Separate package:** `@wordpress/image-editor-next` (or similar) — ships independently.
- **Keep internal:** The cropper stays internal; only the media editor's top-level components are public.

Defer this decision until the API is stable and we have real consumers.

## Known issues and follow-ups

### Minor nits

- Custom slider for ±45° rotation would avoid the native `<input type="range">` behavior of tracking pointer outside the rail (see story demos).
- `cropBounds` recomputation depends on full `state` because React Compiler requires it. Lightweight enough to not matter, but documented as intentional.

### Documented "escape hatches"

- `dispatch` + `CropperAction` are public for MVP but documented as "use the convenience setters unless you have a reason." Follow-up: remove them in Phase 1.
