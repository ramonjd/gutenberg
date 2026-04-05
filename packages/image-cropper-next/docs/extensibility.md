# Extensibility Guide

`@wordpress/image-cropper-next` is designed to be extended by WordPress themes, plugins, and AI agents. This document describes the extension points and how to use them.

## Architecture overview

```
Consumer (plugin/theme/AI agent)
    |
    v
useCropperState()          -- State management (reducer + convenience setters)
    |
    v
<Cropper>                  -- Orchestrates rendering and interaction
    |
    +-- stencil prop       -- Pluggable crop area UI (StencilProps interface)
    +-- useInteraction()   -- Mouse/touch/keyboard → dispatch
    +-- useTransformStyle()-- State → CSS matrix
    |
    v
Pipeline / Export          -- TransformOperation[] → canvas → Blob
```

## Extension points

### 1. Custom stencils

The crop area UI is fully pluggable. Any component that implements `StencilProps` can replace the default `RectangleStencil`.

```tsx
import { Cropper, useCropperState } from '@wordpress/image-cropper-next';
import type { StencilProps } from '@wordpress/image-cropper-next';

function CircularStencil( { cropRect, containerSize, imageSize, onCropChange }: StencilProps ) {
  // Render a circular crop overlay using cropRect bounds.
  // Call onCropChange() when the user resizes.
  return <div className="circular-stencil">...</div>;
}

function MyCropper() {
  const { state, dispatch } = useCropperState();
  return <Cropper src="image.jpg" state={ state } dispatch={ dispatch } stencil={ CircularStencil } />;
}
```

**StencilProps contract:**

| Prop | Type | Description |
|------|------|-------------|
| `cropRect` | `NormalizedRect` | Current crop area in [0,1] normalized space |
| `containerSize` | `Size` | Container pixel dimensions |
| `imageSize` | `Size` | Visual (rotated) image pixel dimensions |
| `onCropChange` | `(rect) => void` | Call during drag to update the crop |
| `onResizeEnd` | `() => void` | Call on mouseup to trigger settle animation |
| `aspectRatio` | `number?` | Locked aspect ratio (width/height) |
| `freeformCrop` | `boolean?` | Whether handles are shown |
| `stencilTransition` | `string?` | CSS transition for settle animation |
| `cropBounds` | `{minX,minY,maxX,maxY}?` | Allowed crop handle limits |

### 2. Transform pipeline (AI agent integration)

The pipeline is the primary interface for programmatic control. Operations are JSON-serializable, making them ideal for AI agents, undo/redo stacks, and remote control.

```typescript
import { useCropperState } from '@wordpress/image-cropper-next';
import type { TransformOperation } from '@wordpress/image-cropper-next';

// An AI agent generates a list of operations:
const operations: TransformOperation[] = [
  { type: 'crop', rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } },
  { type: 'rotate', degrees: 15 },
  { type: 'zoom', factor: 1.5 },
  { type: 'flip', direction: 'horizontal' },
];

// Apply them:
const { applyOperation } = useCropperState();
for ( const op of operations ) {
  applyOperation( op );
}
```

**Replay from scratch:**

```typescript
import { stateFromPipeline, serializePipeline, deserializePipeline } from '@wordpress/image-cropper-next';

// Replay a pipeline from initial state:
const finalState = stateFromPipeline( operations );

// Serialize for storage:
const json = serializePipeline( operations );

// Deserialize with validation:
const ops = deserializePipeline( json );
```

**JSON Schemas for agent discovery:**

The package includes JSON Schema files that agents can read to discover the API without parsing TypeScript:

- `schemas/transform-operation.json` — describes all operation types and their parameters
- `schemas/cropper-state.json` — describes the full state shape

These are standard JSON Schema 2020-12 and can be consumed by any tool that understands JSON Schema (OpenAPI, LLM function calling, etc.).

**Adding new operation types:**

1. Add the operation variant to `TransformOperation` in `core/types.ts`
2. Handle it in `applyOperationToState()` in `core/transforms/pipeline.ts`
3. Add serialization/deserialization support in `deserializePipeline()`
4. Update `schemas/transform-operation.json` with the new operation schema

### 3. Custom export pipelines

The export system converts cropper state to canvas output. You can build custom export pipelines for image processing, format conversion, or AI preprocessing.

```typescript
import { createExportCamera, loadImage } from '@wordpress/image-cropper-next';

// Get the export camera matrix:
const camera = createExportCamera( state, imageSize, outputSize );

// Apply to a canvas context (the matrix maps image pixels → output pixels):
const canvas = document.createElement( 'canvas' );
canvas.width = outputSize.width;
canvas.height = outputSize.height;
const ctx = canvas.getContext( '2d' );
ctx.setTransform( camera[0], camera[1], camera[2], camera[3], camera[4], camera[5] );
ctx.drawImage( image, 0, 0 );

// Now add your own processing:
// - Apply filters
// - Send to AI API for enhancement
// - Convert format
// - Extract region for AI editing
```

### 4. State observation and external control

The state is a plain object, and dispatch is a standard React reducer dispatch. External code can observe state changes and dispatch actions.

```typescript
const { state, dispatch } = useCropperState();

// Observe:
useEffect( () => {
  console.log( 'Crop changed:', state.cropRect );
  console.log( 'Rotation:', state.rotation );
  // Send to analytics, sync with server, update AI context, etc.
}, [ state ] );

// Control externally:
dispatch( { type: 'SET_ZOOM', payload: 2.0 } );
dispatch( { type: 'SET_ROTATION', payload: 45 } );
dispatch( { type: 'SNAP_ROTATE_90', payload: { direction: 1 } } );
dispatch( { type: 'SETTLE_CROP' } );
```

### 5. Camera system (coordinate transforms)

The camera provides world-to-screen and screen-to-world transforms. Use it for:
- Hit testing (is this click inside the image?)
- Coordinate conversion (where on the image did the user click?)
- Custom overlays (annotations, AI selection regions)

```typescript
import { createCamera, worldToScreen, screenToWorld } from '@wordpress/image-cropper-next';

const camera = createCamera( state, containerSize, imageSize );

// Where does image point (0.25, 0.75) appear on screen?
const screenPos = worldToScreen( camera, { x: 0.25, y: 0.75 } );

// Where on the image did the user click (screen pixel 300, 200)?
const imagePos = screenToWorld( camera, { x: 300, y: 200 } );
```

### 6. Source region for external tools

`getSourceRegion()` converts the current crop state to source-pixel coordinates. This is the bridge between the cropper and external tools (image processing libraries, AI APIs, server-side processing) that work in source-pixel coordinates.

```typescript
import { getSourceRegion } from '@wordpress/image-cropper-next';

const region = getSourceRegion( state, { width: naturalWidth, height: naturalHeight } );
// region = { x, y, width, height, rotation, flip, zoom }

// Send to server for processing:
fetch( '/api/process', {
  method: 'POST',
  body: JSON.stringify( {
    imageId: 123,
    crop: { x: region.x, y: region.y, width: region.width, height: region.height },
    rotation: region.rotation,
    flip: region.flip,
  } ),
} );

// Send to AI API for region-specific editing:
const aiRequest = {
  region: { x: region.x, y: region.y, width: region.width, height: region.height },
  prompt: 'Remove the background in this area',
};
```

### 7. Multi-step editing pipelines

`applyToCanvas()` applies the cropper's transform to an existing canvas or image source. This enables multi-step editing where an upstream tool (brightness, color, filters) has already processed the image.

```typescript
import { applyToCanvas } from '@wordpress/image-cropper-next';

// Step 1: Apply brightness/color adjustments to a canvas
const processedCanvas = applyBrightness( sourceImage, { brightness: 1.2 } );

// Step 2: Apply the crop/rotate/flip on top
const finalCanvas = applyToCanvas(
  processedCanvas,
  { width: processedCanvas.width, height: processedCanvas.height },
  cropperState
);

// Step 3: Export
const blob = await canvasToBlob( finalCanvas, 'image/jpeg', 0.9 );
```

Accepts any `CanvasImageSource`: `HTMLImageElement`, `HTMLCanvasElement`, `OffscreenCanvas`, `ImageBitmap`, `HTMLVideoElement`.

### 8. State change notifications

The `onStateChange` callback on the Cropper component fires on every state change. Use it for syncing with external tools, analytics, WordPress hooks, or AI agents.

```tsx
<Cropper
  src="image.jpg"
  state={ state }
  dispatch={ dispatch }
  onStateChange={ ( currentState ) => {
    // Sync with WordPress hooks:
    wp.hooks.doAction( 'image-cropper.stateChanged', currentState );

    // Update AI agent context:
    agentContext.setCropState( currentState );

    // Analytics:
    trackEvent( 'crop_changed', { zoom: currentState.zoom, rotation: currentState.rotation } );
  } }
/>
```

### 9. Theming and styling

The component uses BEM-style CSS classes that themes can override:

```
.wp-image-cropper-next              -- Container
.wp-image-cropper-next__image       -- The image element
.wp-image-cropper-next__stencil     -- Crop area container
.wp-image-cropper-next__stencil-rect -- Crop border rectangle
.wp-image-cropper-next__handle      -- Resize handle (all)
.wp-image-cropper-next__handle--n   -- North handle (etc. for s, e, w, nw, ne, sw, se)
.wp-image-cropper-next__dimming     -- Dimming overlay
.wp-image-cropper-next__grid        -- Grid overlay
.wp-image-cropper-next__grid-line   -- Individual grid line
```

Override in your theme:

```css
.wp-image-cropper-next__handle {
  background: var(--wp--preset--color--primary);
  border-radius: 50%;
}
.wp-image-cropper-next__dimming {
  background: rgba(0, 0, 0, 0.6);
}
```

## AI agent integration patterns

### Driving the cropper from an AI agent

The pipeline API is designed for AI agents. An agent can:

1. **Analyze the image** and determine the optimal crop
2. **Generate a `TransformOperation[]`** with crop, rotation, zoom
3. **Apply it** via `applyOperation()` or `stateFromPipeline()`
4. **Export the result** via `exportCroppedImage()`

```typescript
// Agent generates instructions:
const agentInstructions = {
  crop: { x: 0.1, y: 0.05, width: 0.8, height: 0.9 },
  rotation: 2,  // slight straighten
  zoom: 1.1,
};

// Apply:
applyOperation( { type: 'crop', rect: agentInstructions.crop } );
applyOperation( { type: 'rotate', degrees: agentInstructions.rotation } );
applyOperation( { type: 'zoom', factor: agentInstructions.zoom } );
```

### Region selection for AI editing

Use the camera to convert between screen clicks and image coordinates:

```typescript
// User draws a selection rectangle on screen:
const screenRect = { x: 100, y: 50, width: 200, height: 150 };

// Convert to image coordinates:
const topLeft = screenToWorld( camera, { x: screenRect.x, y: screenRect.y } );
const bottomRight = screenToWorld( camera, {
  x: screenRect.x + screenRect.width,
  y: screenRect.y + screenRect.height,
} );

// Send to AI API:
const aiRegion = {
  x: topLeft.x * naturalWidth,
  y: topLeft.y * naturalHeight,
  width: ( bottomRight.x - topLeft.x ) * naturalWidth,
  height: ( bottomRight.y - topLeft.y ) * naturalHeight,
};
```

## Multi-step editing integration

The package is designed to be one step in a broader image editing pipeline. Key integration patterns:

### Crop as a step (Google Photos style)

The state is external and serializable. You can:
1. Mount the Cropper, let the user crop
2. Snapshot `state` (it's a plain object)
3. Switch to a brightness/color tab (unmount Cropper, the state persists)
4. Switch back — restore `state`, remount Cropper, pick up where you left off

```typescript
// Save state when switching tabs:
const savedCropState = { ...state };

// Restore when coming back:
const { state, dispatch } = useCropperState( savedCropState );
```

### Integration with WordPress media processing library

When the WordPress 7 client-side media processing library is available:

```typescript
// 1. User crops in the Cropper
// 2. Get the source region for server/client processing:
const region = getSourceRegion( state, imageSize );

// 3. Pass to the media processing library:
const processed = await wpMediaProcess( imageFile, {
  crop: region,
  filters: userSelectedFilters,
  format: 'webp',
  quality: 0.85,
} );

// 4. Or apply crop to an already-processed canvas:
const adjustedCanvas = await wpMediaAdjust( imageFile, filters );
const croppedResult = applyToCanvas( adjustedCanvas, imageSize, state );
```

### Extensible operations (planned)

The `TransformOperation` type currently supports crop, rotate, flip, and zoom. For future operations (brightness, contrast, filters), the pipeline can be extended by adding new variants to the type and handlers in `applyOperationToState()`. External code can also wrap the pipeline with custom pre/post processing steps.

## Accessibility

The cropper is keyboard-accessible and screen-reader friendly:

**Keyboard controls:**
- **Arrow keys** on the container: pan the image
- **+/-** on the container: zoom in/out
- **R** on the container: snap rotate 90°
- **Tab** to crop handles, then **arrow keys** to resize (0.02 step per keypress)
- Aspect ratio lock is respected during keyboard resize

**Screen reader support:**
- Container has `role="application"` and `aria-label="Image cropper"`
- Resize handles have `role="separator"`, `aria-orientation`, and descriptive `aria-label` (e.g., "Resize north-west corner")
- An ARIA live region announces state changes (zoom, rotation, crop dimensions) with 300ms debounce

**For theme/plugin developers:**
- Custom stencils should preserve `tabIndex`, `role`, and `aria-*` attributes on interactive elements
- Use `aria-live="polite"` for any custom state announcements
- Ensure custom overlays don't trap keyboard focus

## Future extension areas

These features are not built yet but the architecture supports them:

| Feature | Extension point | Approach |
|---------|----------------|----------|
| Image filters/effects | `applyToCanvas()` | Process canvas, then apply crop |
| Format conversion | `canvasToBlob()` | Already supports MIME type parameter |
| AI auto-crop | Pipeline API | Agent generates `TransformOperation[]` |
| AI region editing | `getSourceRegion()` + custom stencil | Source-pixel coords for AI API |
| Undo/redo | Pipeline | Store operations, replay subsets |
| Video frame extraction | `applyToCanvas()` | Extract frame → feed as `CanvasImageSource` |
| Batch processing | Pipeline + state | `stateFromPipeline()` on multiple images |
| Remote collaboration | State serialization | Sync `CropperState` via WebSocket |
| Custom overlays | Stencil system | Compose multiple stencils or overlay components |
| WP media processing | `getSourceRegion()` + `applyToCanvas()` | Bridge to WordPress 7 media library |

## For AI agents maintaining this codebase

### Key files and their roles

- **`core/camera.ts`** — All coordinate math. If something renders wrong, start here.
- **`hooks/use-cropper-state.ts`** — State transitions. If state is wrong after an action, the bug is here.
- **`hooks/use-interaction.ts`** — Input handling. If mouse/touch/keyboard behaves wrong, look here.
- **`hooks/use-transform-style.ts`** — CSS transform. If the image appears in the wrong position, check here.
- **`components/cropper.tsx`** — Orchestrator. Wires everything together.
- **`components/stencils/rectangle-stencil.tsx`** — Crop handles and move logic.

### Critical invariant

> The image must always fully cover the crop area. `enforceContainment()` in `use-cropper-state.ts` maintains this after every state change.

If you see the image edge inside the crop area, the bug is in `restrictPanZoom()` or `restrictCropRect()` in `camera.ts`.

### Coordinate system

All crop/pan values are in **normalized visual space** where `[0,1]` maps to the visual (rotated) bounding box of the image at zoom=1. This space changes when rotation changes, which is why rotation handlers need special care.

### Testing

```bash
npm run test:unit -- packages/image-cropper-next/    # All tests
npm run test:unit -- --testPathPattern="camera"       # Camera tests only
```

The visual coverage invariant test in `core/test/camera.ts` verifies that the image covers the crop at multiple rotation/zoom combinations. Run it after any restriction changes.
