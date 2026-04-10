# @wordpress/image-cropper-next — Feature Summary

## Current Features

### Core Cropping

- **Rectangular crop** with 8 resize handles (corners + edges)
- **Two crop modes:**
  - **Fixed crop** (default) — crop area is centered, user drags the image behind it (react-easy-crop style)
  - **Freeform crop** — crop area has resize handles and can be freely repositioned and resized by dragging
- **Draggable crop area** in freeform mode — click and drag inside the crop to move it without resizing
- **Aspect ratio lock** — when set, only corner handles are shown and the crop maintains the ratio during resize
- **Settle animation** — after resizing, the crop smoothly re-centers and fills the available height, preserving the exact image selection
- **Crop handle bounds** — handles are constrained to both the visible image edge and the container boundary, whichever is more restrictive

### Rotation

- **Continuous ±45° rotation** via slider — the crop area stays still, the image zooms in to cover it
- **90° snap rotation** (Google Photos style) — the crop rotates with the image (width↔height swap), preserving the selected image region
- **Rotation origin** — rotation visually pivots around the crop center
- **Constrained to ±45° per cardinal step** — prevents extreme angles that would require excessive zoom

### Zoom, Pan, and Flip

- **Mouse wheel zoom** with configurable speed
- **Two-finger pinch zoom** on touch devices
- **Mouse drag pan** — drag the image behind the crop (or outside the crop area in freeform mode)
- **Single-finger touch pan**
- **Horizontal and vertical flip**
- **Containment invariant** — the image always fully covers the crop area, enforced after every state change

### Camera System (gl-matrix)

- **World/Camera/Screen coordinate spaces** — clean separation using gl-matrix `mat2d` matrices
- **`createCamera()`** — composes a single matrix from all transform state (zoom, pan, rotation, flip, container fit)
- **`worldToScreen()` / `screenToWorld()`** — coordinate conversion between image-normalized [0,1] space and screen pixels
- **`getImageFit()`** — shared "contain" fit calculation for image sizing
- **`getCropBounds()`** — computes actual image footprint AABB for crop handle limits
- **Restriction via camera inverse** — `restrictPanZoom()` builds a camera and projects through its inverse, guaranteeing the restriction agrees with the rendering

### Export

- **Canvas rendering** with full transform support (crop, rotation, flip, zoom)
- **`createExportCamera()`** — export-specific matrix mapping image pixels to output canvas
- **Configurable output** — MIME type and quality parameters
- **`applyToCanvas()`** — apply crop transforms to any `CanvasImageSource` (HTMLCanvasElement, ImageBitmap, OffscreenCanvas, HTMLVideoElement), enabling multi-step editing pipelines

### Non-Destructive Pipeline

- **`TransformOperation`** — JSON-serializable operations: crop, rotate, flip, zoom
- **`stateFromPipeline()`** — replay any sequence of operations from initial state
- **`serializePipeline()` / `deserializePipeline()`** — JSON serialization with validation
- **Immutable state** — every operation returns a new state, enabling undo/redo patterns

---

## AI Agent Integration Points

### Programmatic Control

- **Pipeline API** — AI agents generate `TransformOperation[]` arrays and apply them via `applyOperation()`. No UI interaction required.
- **State replay** — `stateFromPipeline()` replays a full operation sequence, allowing agents to compute the final result without mounting the React component.
- **State observation** — `onStateChange` callback on the Cropper component fires on every state change, allowing agents to monitor user interactions in real time.

### Machine-Readable Schemas

- **`schemas/transform-operation.json`** — JSON Schema 2020-12 describing all available operations and their parameters. Compatible with OpenAPI, LLM function calling, and any JSON Schema-aware tool.
- **`schemas/cropper-state.json`** — JSON Schema describing the full state shape, enabling agents to understand and generate valid state objects.

### Source Region Bridge

- **`getSourceRegion()`** — converts the current crop state to source-pixel coordinates (`{ x, y, width, height, rotation, flip, zoom }`). This is the bridge between the cropper's internal coordinate system and external AI APIs that work in pixel coordinates.
- Use cases: sending crop regions to AI image editing APIs, server-side processing, or background removal services.

### Coordinate Transforms

- **`worldToScreen()` / `screenToWorld()`** — agents can convert between image coordinates and screen positions for tasks like click simulation, annotation placement, or region selection for AI editing.

---

## Extension Points for Developers

### Pluggable Stencils

- Any React component implementing the `StencilProps` interface can replace the default `RectangleStencil`. This enables circular crops, polygon crops, guided crop overlays, or any custom crop UI.

### Custom Export Pipelines

- **`applyToCanvas()`** accepts any `CanvasImageSource`, enabling chaining: apply brightness → apply crop → export. Works with the WordPress client-side media processing library.
- **`createExportCamera()`** gives direct access to the transform matrix for custom canvas operations.

### State Management

- State is a plain serializable object, dispatch is standard React. External code can observe, modify, snapshot, restore, or sync state across tabs, sessions, or network.
- **`onStateChange`** callback for WordPress hooks integration (`wp.hooks.doAction`).

### Theming

- BEM CSS classes (`.wp-media-editor-image-cropper__*`) for full visual customization by themes.
- No hardcoded colors or dimensions — everything is overridable via CSS.

### Pipeline Extensibility

- New operation types can be added by extending `TransformOperation` in types, handling in `applyOperationToState()`, and updating the JSON schema.
- External code can wrap the pipeline with pre/post processing steps.

---

## Accessibility Features

### Keyboard Support

- **Arrow keys** — pan the image (on the container)
- **+/-** — zoom in/out
- **R** — snap rotate 90°
- **Tab** to crop handles, then **arrow keys** to resize (0.02 normalized step per keypress)
- Aspect ratio lock is respected during keyboard resize
- Crop handle bounds are respected during keyboard resize

### Screen Reader Support

- Container has `role="application"` and `aria-label="Image cropper"`
- Resize handles have `role="separator"`, `aria-orientation`, and descriptive `aria-label` (e.g., "Resize north-west corner")
- ARIA live region announces state changes (zoom percentage, rotation degrees, crop dimensions) with 300ms debounce to avoid excessive announcements

### Focus Management

- All interactive elements are focusable via Tab
- Crop handles are keyboard-operable without mouse

---

## Future Potential Use Cases

### Image Processing Integration

- **Client-side filters and effects** — chain brightness, contrast, saturation adjustments with `applyToCanvas()` before or after cropping
- **Format conversion and compression** — `canvasToBlob()` already supports MIME type; integrate with WordPress media processing for WebP/AVIF output
- **Batch processing** — `stateFromPipeline()` on multiple images with the same operations

### AI-Powered Features

- **Auto-crop** — AI analyzes the image and generates optimal `TransformOperation[]` (subject detection, rule-of-thirds alignment)
- **Region selection for AI editing** — `getSourceRegion()` provides pixel coordinates for sending selected areas to generative AI APIs (background removal, object removal, inpainting)
- **Smart resize** — AI suggests crop adjustments when aspect ratio changes to keep important content visible
- **Content-aware straightening** — AI detects horizon lines and generates rotation operations

### Multi-Step Editing (Google Photos Style)

- **Tab-based editing** — crop → adjust colors → apply filters → crop again. State persists between tabs since it's external and serializable.
- **Non-destructive workflow** — all operations stored as pipeline, replayable, undoable
- **WordPress media processing library integration** — `getSourceRegion()` and `applyToCanvas()` bridge to the WordPress 7 client-side processing library

### Video

- **Frame extraction** — extract a video frame as `ImageBitmap`, feed to `applyToCanvas()` for crop/rotate
- **Thumbnail generation** — apply crop state to video poster frames

### Collaboration

- **Real-time sync** — `CropperState` is serializable, syncable via WebSocket for collaborative editing
- **Remote agent control** — AI agent on server generates operations, client applies them in real time

### Custom Crop UIs

- **Circular crop stencil** — for profile pictures
- **Polygon crop stencil** — for freeform selections (architecture exists, deferred from MVP)
- **Guided crop overlays** — templates for social media sizes, document scans, product photos
- **Annotation layers** — overlays for AI region marking, face detection boxes, OCR regions
