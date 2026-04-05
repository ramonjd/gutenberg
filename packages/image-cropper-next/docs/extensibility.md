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

**Adding new operation types:**

1. Add the operation variant to `TransformOperation` in `core/types.ts`
2. Handle it in `applyOperationToState()` in `core/transforms/pipeline.ts`
3. Add serialization/deserialization support in `deserializePipeline()`

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

### 6. Theming and styling

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

## Future extension areas

These features are not built yet but the architecture supports them:

| Feature | Extension point | Approach |
|---------|----------------|----------|
| Image filters/effects | Custom export pipeline | Post-process the export canvas |
| Format conversion | `canvasToBlob()` | Already supports MIME type parameter |
| AI auto-crop | Pipeline API | Agent generates `TransformOperation[]` |
| AI region editing | Camera + custom stencil | `screenToWorld` for coordinates, custom stencil for selection UI |
| Undo/redo | Pipeline | Store operations, replay subsets |
| Video frame extraction | Export system | Extract frame → feed to cropper state |
| Batch processing | Pipeline + state | `stateFromPipeline()` on multiple images |
| Remote collaboration | State serialization | Sync `CropperState` via WebSocket |
| Keyboard accessibility | Interaction hook | Extend `useInteraction` key handlers |
| Custom overlays | Stencil system | Compose multiple stencils or overlay components |

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
