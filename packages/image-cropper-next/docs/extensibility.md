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

These are local schema files within the package directory, not published to schemas.wp.org. They follow standard JSON Schema 2020-12 and can be consumed by any tool that understands JSON Schema (OpenAPI, LLM function calling, etc.).

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

### 4. State management patterns

The state is a plain object, and dispatch is a standard React reducer dispatch. There are two ways to use it depending on your component structure.

**Direct hook (simple case):**

When the cropper and controls are in the same component:

```tsx
import { Cropper, useCropperState } from '@wordpress/image-cropper-next';

function ImageEditor() {
  const { state, dispatch, setZoom, snapRotate90, reset } = useCropperState();
  return (
    <div>
      <button onClick={ () => setZoom( state.zoom + 0.5 ) }>Zoom In</button>
      <button onClick={ () => snapRotate90( 1 ) }>Rotate 90</button>
      <button onClick={ () => reset() }>Reset</button>
      <Cropper src="image.jpg" state={ state } dispatch={ dispatch } />
    </div>
  );
}
```

**Provider pattern (deep component trees):**

When controls and the cropper are in different parts of the tree, use `CropperProvider` to avoid prop-drilling. Any descendant can call `useCropper()` to access the state:

```tsx
import { Cropper, CropperProvider, useCropper } from '@wordpress/image-cropper-next';

function ImageEditor() {
  return (
    <CropperProvider>
      <Toolbar />
      <CropperPanel />
      <Sidebar />
    </CropperProvider>
  );
}

function Toolbar() {
  const { state, setZoom, snapRotate90 } = useCropper();
  return (
    <div>
      <button onClick={ () => setZoom( state.zoom + 0.5 ) }>Zoom In</button>
      <button onClick={ () => snapRotate90( 1 ) }>Rotate 90</button>
    </div>
  );
}

function CropperPanel() {
  const { state, dispatch } = useCropper();
  return <Cropper src="image.jpg" state={ state } dispatch={ dispatch } freeformCrop />;
}

function Sidebar() {
  const { state } = useCropper();
  return <p>Zoom: { Math.round( state.zoom * 100 ) }%</p>;
}
```

**External control via dispatch:**

```typescript
// Observe state:
useEffect( () => {
  console.log( 'Crop changed:', state.cropRect );
  // Send to analytics, sync with server, update AI context, etc.
}, [ state ] );

// Control programmatically:
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
.wp-image-cropper-next                -- Container (cursor: grab)
.wp-image-cropper-next--dragging      -- Applied during image pan drag (cursor: grabbing)
.wp-image-cropper-next__image         -- The image element
.wp-image-cropper-next__stencil       -- Crop area container (pointer-events: none)
.wp-image-cropper-next__stencil-rect  -- Crop border rectangle
.wp-image-cropper-next__handle        -- Resize handle (all, pointer-events: auto)
.wp-image-cropper-next__handle--n     -- North handle (cursor: ns-resize)
.wp-image-cropper-next__handle--s     -- South handle (cursor: ns-resize)
.wp-image-cropper-next__handle--e     -- East handle (cursor: ew-resize)
.wp-image-cropper-next__handle--w     -- West handle (cursor: ew-resize)
.wp-image-cropper-next__handle--nw    -- North-west handle (cursor: nwse-resize)
.wp-image-cropper-next__handle--ne    -- North-east handle (cursor: nesw-resize)
.wp-image-cropper-next__handle--sw    -- South-west handle (cursor: nesw-resize)
.wp-image-cropper-next__handle--se    -- South-east handle (cursor: nwse-resize)
.wp-image-cropper-next__dimming       -- Dimming overlay outside crop area
.wp-image-cropper-next__grid          -- Grid overlay container
.wp-image-cropper-next__grid-line     -- Individual grid line
```

All styles are in CSS classes with no inline style overrides, so consumers can override anything with equal or higher specificity.

**Override handles and dimming:**

```css
.wp-image-cropper-next__handle {
  background: var(--wp--preset--color--primary);
  border-radius: 50%;
}
.wp-image-cropper-next__dimming {
  background: rgba(0, 0, 0, 0.6);
}
```

**Override cursors:**

```css
/* Use crosshair instead of grab */
.wp-image-cropper-next {
  cursor: crosshair;
}
.wp-image-cropper-next--dragging {
  cursor: move;
}
/* Custom handle cursor */
.wp-image-cropper-next__handle {
  cursor: pointer;
}
```

**Override handle appearance per position:**

```css
/* Only show corner handles, hide edge handles */
.wp-image-cropper-next__handle--n,
.wp-image-cropper-next__handle--s,
.wp-image-cropper-next__handle--e,
.wp-image-cropper-next__handle--w {
  display: none;
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

### Headless editing (no React, no DOM)

The core layer is pure functions — no React or browser required for steps 1-2:

```typescript
import {
  stateFromPipeline,
  getSourceRegion,
  exportCroppedImage,
} from '@wordpress/image-cropper-next';

// 1. Build state from operations (pure — runs in Node, workers, anywhere)
const state = stateFromPipeline( [
  { type: 'crop', rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } },
  { type: 'rotate', degrees: 5 },
  { type: 'zoom', factor: 1.2 },
  { type: 'flip', direction: 'horizontal' },
] );

// 2. Get source-pixel region (pure — for server-side FFmpeg/ImageMagick)
const region = getSourceRegion( state, { width: 4000, height: 3000 } );
// → { x: 400, y: 300, width: 3200, height: 2400, rotation: 5, flip: {...}, zoom: 1.2 }

// Pass to server:
// ffmpeg -i input.jpg -vf "crop=3200:2400:400:300,rotate=0.087" output.jpg

// 3. Or export to Blob (needs canvas — browser or node-canvas)
const blob = await exportCroppedImage( imageUrl, state, 'image/jpeg', 0.9 );
```

Steps 1 and 2 are pure functions with zero DOM dependencies. Step 3 needs `canvas` and `Image` (browser, jsdom, or node-canvas).

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

### Undo/redo via pipeline

The pipeline API supports undo/redo out of the box. See the `UndoRedo` story for a working example. The pattern:

- Maintain `past` and `future` stacks of pipeline snapshots
- On each action: push current pipeline to `past`, clear `future`, append operation
- Undo: pop `past`, push current to `future`, `RESET` + replay previous pipeline
- Redo: pop `future`, push current to `past`, `RESET` + replay next pipeline

**Canvas interactions (drag, wheel zoom, handle resize)** generate many rapid state changes. To integrate these with undo/redo, use **gesture grouping**: snapshot the state at mousedown and mouseup, treating the entire drag as one undo step. The pipeline API supports this — the missing piece is gesture boundary detection, which is a consumer-side concern. A debounced approach (snapshot after N ms of inactivity) also works for wheel zoom.

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

## WordPress integration patterns

These patterns show how the cropper integrates with WordPress-specific systems. They consume the existing API — no package changes needed.

### Theme-aware aspect ratio presets

WordPress themes register image sizes via `add_image_size()`. The cropper can suggest aspect ratios that match the active theme's layout:

```typescript
import { DEFAULT_ASPECT_RATIOS } from '@wordpress/image-cropper-next';
import type { AspectRatioPreset } from '@wordpress/image-cropper-next';

// Build presets from theme's registered image sizes.
function getThemePresets( imageSizes ): AspectRatioPreset[] {
  const themePresets = imageSizes
    .filter( size => size.width && size.height )
    .map( size => ( {
      label: `${ size.name } (${ size.width }×${ size.height })`,
      value: size.width / size.height,
    } ) );
  return [ ...DEFAULT_ASPECT_RATIOS, ...themePresets ];
}

// Or let plugins add presets via WordPress hooks:
const presets = wp.hooks.applyFilters(
  'imageEditing.aspectRatioPresets',
  DEFAULT_ASPECT_RATIOS
);
```

### Block context integration

When the cropper opens from a block (Image, Cover, Media & Text), the block knows its target layout. Pass the block's aspect ratio as the default:

```typescript
// In the Image block's edit component:
const blockAspectRatio = getBlockAspectRatio( blockAttributes );

<Cropper
  src={ imageUrl }
  state={ state }
  dispatch={ dispatch }
  aspectRatio={ blockAspectRatio }  // Pre-set to match block layout
/>
```

Cover blocks at 16:9 open the cropper at 16:9. Avatar blocks open at 1:1. The user sees the right crop immediately.

### WordPress hooks integration

Use `onStateChange` to bridge into the WordPress hooks system:

```typescript
<Cropper
  src={ imageUrl }
  state={ state }
  dispatch={ dispatch }
  onStateChange={ ( currentState ) => {
    // Let plugins react to crop changes.
    wp.hooks.doAction( 'imageEditing.stateChanged', currentState );
  } }
/>

// In a plugin:
wp.hooks.addAction( 'imageEditing.stateChanged', 'my-plugin', ( state ) => {
  // Update preview, sync with server, trigger AI analysis, etc.
} );
```

Plugins can also filter the available controls:

```typescript
// Let plugins add custom toolbar buttons.
const extraControls = wp.hooks.applyFilters(
  'imageEditing.toolbarControls',
  [],
  state
);

// Let plugins modify the export before saving.
wp.hooks.addFilter( 'imageEditing.beforeSave', 'my-plugin', ( blob, state ) => {
  // Add watermark, compress further, convert format, etc.
  return processedBlob;
} );
```

### REST API and media library

Save crop metadata to the attachment via the REST API so the server can regenerate crops:

```typescript
import { getSourceRegion } from '@wordpress/image-cropper-next';

// After the user finishes editing:
const region = getSourceRegion( state, {
  width: attachment.naturalWidth,
  height: attachment.naturalHeight,
} );

// Save to the attachment's metadata.
wp.apiFetch( {
  path: `/wp/v2/media/${ attachment.id }`,
  method: 'POST',
  data: {
    meta: {
      crop_region: {
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        rotation: region.rotation,
        flip: region.flip,
      },
    },
  },
} );
```

This enables:
- Server-side crop regeneration when themes change image sizes
- Crop history per attachment
- "Reset to original" using stored metadata
- Multiple crops per registered size (future)

### Multi-size cropping (future)

WordPress generates multiple sizes from one upload. The cropper could let users define per-size crops:

```typescript
// Future API concept:
const crops = {
  thumbnail: { cropRect: { x: 0.2, y: 0.1, width: 0.6, height: 0.8 }, rotation: 0 },
  medium:    { cropRect: { x: 0, y: 0, width: 1, height: 1 }, rotation: 5 },
  featured:  { cropRect: { x: 0.1, y: 0, width: 0.8, height: 0.5 }, rotation: 0 },
};

// Each size stores its own CropperState, all from the same source image.
// getSourceRegion() + server-side processing generates each size independently.
```

### AI plugin integration

AI plugins (Jetpack AI, third-party) can add features using the existing extension points:

```typescript
// An AI plugin adds an "Auto straighten" button:
wp.hooks.addFilter( 'imageEditing.toolbarControls', 'jetpack-ai', ( controls, state ) => {
  return [
    ...controls,
    {
      label: 'Auto straighten',
      onClick: async () => {
        const region = getSourceRegion( state, imageSize );
        const result = await jetpackAI.analyzeStraighten( region );
        // result.rotation = 2.3 (degrees to correct)
        applyOperation( { type: 'rotate', degrees: result.rotation } );
      },
    },
  ];
} );

// An AI plugin adds "Smart crop" that detects the subject:
wp.hooks.addFilter( 'imageEditing.toolbarControls', 'jetpack-ai', ( controls, state ) => {
  return [
    ...controls,
    {
      label: 'Smart crop',
      onClick: async () => {
        const suggestion = await jetpackAI.suggestCrop( attachment.url );
        // suggestion = { x: 0.1, y: 0.05, width: 0.8, height: 0.9 }
        applyOperation( { type: 'crop', rect: suggestion } );
      },
    },
  ];
} );
```

### Remembering preferences per block type

Store the last-used aspect ratio per block type so the cropper opens with the right preset:

```typescript
// When the user selects an aspect ratio:
wp.data.dispatch( 'core/preferences' ).set(
  'image-editing',
  `lastAspectRatio/${ blockName }`,
  selectedRatio
);

// When opening the cropper:
const lastRatio = wp.data.select( 'core/preferences' ).get(
  'image-editing',
  `lastAspectRatio/${ blockName }`
);

<Cropper aspectRatio={ lastRatio ?? undefined } ... />
```

Cover blocks remember 16:9, avatar blocks remember 1:1, and the user never has to re-select.

## Lazy loading

The package is tree-shakeable and can be lazy-loaded via standard React patterns. This is recommended for WordPress integrations where the cropper is not always visible (e.g., only shown when the user clicks "Edit image"):

```tsx
import { lazy, Suspense } from 'react';

// The entire cropper bundle (including gl-matrix) is only loaded
// when the user opens the image editor.
const ImageEditor = lazy( () => import( './ImageEditor' ) );

function MediaPanel( { showEditor } ) {
  if ( ! showEditor ) {
    return <button>Edit image</button>;
  }
  return (
    <Suspense fallback={ <Spinner /> }>
      <ImageEditor src={ imageUrl } />
    </Suspense>
  );
}
```

In the lazy-loaded module:

```tsx
// ImageEditor.tsx — only loaded on demand
import { Cropper, useCropperState } from '@wordpress/image-cropper-next';

export default function ImageEditor( { src } ) {
  const { state, dispatch } = useCropperState();
  return <Cropper src={ src } state={ state } dispatch={ dispatch } />;
}
```

This is a consumer-side pattern — no changes needed in the package. The package is ~8KB gzipped (mostly gl-matrix) and all exports are tree-shakeable. If you only import `stateFromPipeline` for headless processing, the React components and gl-matrix won't be bundled.

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

## Testing

### Running unit tests

```bash
# All image-cropper-next unit tests
npx wp-scripts test-unit-js --testPathPattern="image-cropper-next"

# Specific test file (e.g., camera tests only)
npx wp-scripts test-unit-js --testPathPattern="image-cropper-next" --testNamePattern="camera"

# TypeScript type checking (no emit)
npx tsc --project packages/image-cropper-next/tsconfig.json --noEmit
```

### Running visual regression tests (storybook-playwright)

Visual regression tests use Playwright to screenshot Storybook stories and compare against baseline images. The spec is at `test/storybook-playwright/specs/image-cropper-next.spec.ts`.

```bash
# Start Storybook first (port 50241)
npm run storybook

# Run the visual regression tests
npx playwright test test/storybook-playwright/specs/image-cropper-next.spec.ts

# Update screenshots after intentional visual changes
npx playwright test test/storybook-playwright/specs/image-cropper-next.spec.ts --update-snapshots
```

### What the tests cover

**Export matrix verification** (`core/export/test/canvas-renderer.ts`):
- Identity state produces a 1:1 scale mapping with no rotation components
- 90-degree rotation encodes rotation in the off-diagonal matrix values (a,d near zero; b,c non-zero with opposite signs)
- Zoom 2x doubles the scale components relative to zoom 1x
- Horizontal flip negates the x-scale component
- `applyToCanvas` creates a canvas with correct dimensions and calls `setTransform`

**Containment invariant** (`core/test/camera.ts`):
- Verifies the image fully covers the crop area across multiple rotation and zoom combinations
- Tests `restrictPanZoom` and `restrictCropRect` boundary enforcement
- Run after any changes to camera restriction logic

**Visual regression** (`test/storybook-playwright/specs/image-cropper-next.spec.ts`):
- Screenshots the Default and WithControls stories
- Catches unintended visual changes to the cropper UI

### Adding new test cases

1. **New export transform tests**: Add to the `renderToCanvas -- export matrix verification` describe block in `core/export/test/canvas-renderer.ts`. Use `setupMockCanvas()` to initialize mocks, then call `renderToCanvas` and inspect `mockCtx.setTransform.mock.calls[0]` for the 6 matrix values `[a, b, c, d, e, f]`.

2. **New containment invariant cases**: Add rotation/zoom combinations to the parametric test in `core/test/camera.ts`.

3. **New visual regression stories**: Add a new test case in `test/storybook-playwright/specs/image-cropper-next.spec.ts` using `gotoStoryId` with the Storybook story ID (format: `imagecroppernext-rectanglecrop--story-name`).

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
