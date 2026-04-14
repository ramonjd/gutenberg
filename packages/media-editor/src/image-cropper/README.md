# Image Cropper

A modular image cropper inside `@wordpress/media-editor`. Two layers: a framework-agnostic **core** (pure functions, `gl-matrix` only) and a thin **React** adapter.

## Quick start

```tsx
import { Cropper, useCropperState } from '@wordpress/media-editor';

function ImageEditor() {
  const { state, dispatch } = useCropperState();
  return (
    <div style={ { width: 600, height: 400 } }>
      <Cropper
        src="https://example.com/photo.jpg"
        state={ state }
        dispatch={ dispatch }
        showDimming
        showGrid
        freeformCrop
      />
    </div>
  );
}
```

## Docs

-   [docs/architecture.md](docs/architecture.md) — Data flow, coordinate spaces, and design decisions
-   [docs/recipes.md](docs/recipes.md) — Getting started walkthrough, extension points, and integration patterns

## API Reference

All exports are available from `@wordpress/media-editor`. The core layer has zero React dependency.

### React components

#### `Cropper`

Main cropper component. Fills its parent container.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | `string` | **required** | Image source URL |
| `state` | `CropperState` | **required** | State from `useCropperState` |
| `dispatch` | `Dispatch<CropperAction>` | **required** | Dispatch from `useCropperState` |
| `stencil` | `ComponentType<StencilProps>` | `RectangleStencil` | Custom crop area UI |
| `showGrid` | `boolean` | `false` | Rule-of-thirds grid overlay |
| `showDimming` | `boolean` | `false` | Dimming overlay outside crop |
| `minZoom` | `number` | `1` | Minimum zoom level |
| `maxZoom` | `number` | `10` | Maximum zoom level |
| `aspectRatio` | `number` | — | Fixed aspect ratio (width/height) |
| `freeformCrop` | `boolean` | `false` | Enable resize handles |
| `onImageLoaded` | `(size: Size) => void` | — | Image load callback |
| `onStateChange` | `(state: CropperState) => void` | — | Every-frame state callback |
| `onGestureStart` | `() => void` | — | Gesture boundary start |
| `onGestureEnd` | `() => void` | — | Gesture boundary end |
| `className` | `string` | — | Additional CSS class |

#### `CropperProvider` / `useCropper()`

Context wrapper for deep component trees. Wraps `useCropperState` and provides it to descendants via `useCropper()`.

#### `RectangleStencil`

Default stencil component with 8 resize handles. Used automatically unless overridden via the `stencil` prop.

#### `GridOverlay` / `DimmingOverlay`

Presentational overlays. Used automatically by `Cropper` when `showGrid` / `showDimming` are set.

### React hooks

#### `useCropperState( initialState?: Partial<CropperState> ): UseCropperStateReturn`

State management hook. Returns:

| Field | Type | Description |
|-------|------|-------------|
| `state` | `CropperState` | Current state |
| `dispatch` | `Dispatch<CropperAction>` | Raw reducer dispatch |
| `setCrop` | `(crop: NormalizedPoint) => void` | Set pan offset |
| `setZoom` | `(zoom: number) => void` | Set zoom (clamped 1–10) |
| `setRotation` | `(degrees: number) => void` | Set rotation (normalized 0–360) |
| `setFlip` | `(flip: Flip) => void` | Set flip state |
| `snapRotate90` | `(direction: 1 \| -1) => void` | 90° snap rotation |
| `setCropRect` | `(rect: NormalizedRect) => void` | Set crop rectangle |
| `applyOperation` | `(op: TransformOperation) => void` | Apply a pipeline operation |
| `reset` | `(state?: Partial<CropperState>) => void` | Reset to initial or given state |
| `isDirty` | `boolean` | Whether state differs from initial |
| `getCroppedImage` | `(mime?: string, quality?: number) => Promise<Blob \| null>` | Export as Blob |

#### `useInteraction( state, dispatch, containerSize, imageSize?, options? ): UseInteractionReturn`

Interaction hook. Returns event handlers (`onPointerDown`, `onTouchStart`, `onKeyDown`), `onWheelNative`, `isDragging`, `isZooming`. Used internally by `Cropper`.

#### `useTransformStyle( state, containerSize, imageSize ): string`

Returns a CSS `matrix()` transform string. Used internally by `Cropper`.

### Core — State

#### `cropperReducer( state: CropperState, action: CropperAction ): CropperState`

Pure reducer. Every action runs through `enforceContainment` to maintain the invariant: the image always covers the crop area.

Actions: `SET_IMAGE`, `SET_CROP`, `SET_ZOOM`, `SET_ZOOM_AT_POINT`, `SET_ROTATION`, `SNAP_ROTATE_90`, `SET_FLIP`, `SET_CROP_RECT`, `SETTLE_CROP`, `APPLY_OPERATION`, `RESET`.

#### `enforceContainment( state: CropperState ): CropperState`

Bumps zoom, restricts crop rect, and clamps pan to maintain containment. Called automatically by the reducer.

#### `isStateDirty( current: CropperState, initial: CropperState ): boolean`

Shallow field comparison for dirty-state detection.

### Core — Camera and coordinates

#### `createCamera( state, containerSize, imageSize ): Camera`

Builds a `mat2d` matrix composing pan, rotation, flip, zoom, and contain-fit.

#### `worldToScreen( camera, point: NormalizedPoint ): PixelPoint`

Transform a [0,1] normalized point to screen pixels.

#### `screenToWorld( camera, point: PixelPoint ): NormalizedPoint`

Inverse: screen pixels to [0,1] normalized coordinates.

#### `getImageFit( containerSize, imageSize, rotation ): { elementSize, visualSize }`

Contain-fit calculation. Returns the rendered image element size and the visual (rotated) bounding box size.

#### `getCropBounds( state, elementSize, visualSize, containerSize ): { minX, minY, maxX, maxY }`

Computes the allowed crop handle bounds from the actual image footprint.

#### `restrictPanZoom( state, imageSize, cropRect ): { crop, zoom }`

Restricts pan and zoom so the image covers the crop area. Bumps zoom if needed.

#### `restrictCropRect( cropRect, zoom, rotation, imageAspectRatio ): NormalizedRect`

Shrinks the crop rect if it's too large for the current zoom/rotation.

#### `getMinZoomForCover( rotation, imageAspectRatio, cropRect ): number`

Minimum zoom needed for the image to cover the crop area.

### Core — Source region

#### `getSourceRegion( state, imageSize ): SourceRegion`

Converts crop state to source-pixel coordinates: `{ x, y, width, height, rotation, flip, zoom }`. For server-side processing (FFmpeg, ImageMagick, etc.).

#### `getSourceRegionPercent( state, imageSize ): SourceRegionPercent`

Same as `getSourceRegion` but returns percentages (0–100): `{ x, y, width, height }`. Compatible with the WordPress REST API attachments `/edit` endpoint.

### Core — Export

#### `loadImage( src: string ): Promise<HTMLImageElement>`

Loads an image with CORS support.

#### `renderToCanvas( image, state ): HTMLCanvasElement`

Renders the image with all transforms applied to a new canvas.

#### `applyToCanvas( source: CanvasImageSource, imageSize, state ): HTMLCanvasElement`

Applies transforms to any `CanvasImageSource` (image, canvas, video frame, offscreen canvas).

#### `exportCroppedImage( src, state, mimeType?, quality? ): Promise<Blob>`

End-to-end: load image → render → export as Blob.

#### `downloadCroppedImage( src, state, filename?, mimeType?, quality? ): Promise<void>`

Triggers a browser download of the cropped image.

#### `canvasToBlob( canvas, mimeType?, quality? ): Promise<Blob>`

Canvas → Blob conversion.

#### `canvasToDataURL( canvas, mimeType?, quality? ): string`

Canvas → data URL conversion.

### Core — Pipeline

#### `stateFromPipeline( operations: TransformOperation[] ): CropperState`

Replays a sequence of operations from default state. Pure function, no DOM needed.

#### `applyOperationToState( state, operation ): CropperState`

Applies a single operation to an existing state.

#### `createPipeline(): TransformOperation[]`

Creates an empty pipeline array.

#### `addOperation( pipeline, operation ): TransformOperation[]`

Appends an operation (immutable — returns a new array).

#### `serializePipeline( pipeline ): string`

JSON serialization.

#### `deserializePipeline( json: string ): TransformOperation[]`

JSON deserialization with validation.

### Core — Transform style

#### `computeTransformStyle( state, imageSize ): string`

Pure function returning a CSS `matrix(a, b, c, d, tx, ty)` string.

### Core — Interaction controller

#### `InteractionController`

Framework-agnostic class for pointer/wheel/touch/keyboard event handling. See [docs/recipes.md](docs/recipes.md) for usage with vanilla JS and Vue.

Constructor: `new InteractionController( options: InteractionControllerOptions )`

Methods: `handlePointerDown(e, el)`, `handleWheel(e)`, `handleTouchStart(e, rect, doc?)`, `handleKeyDown(e)`, `destroy()`.

### Core — Stencil math

#### `computeFreeResizeRect( drag, clientX, clientY, imageSize, bounds ): NormalizedRect`

Computes a new crop rect during freeform (no aspect ratio) resize.

#### `computeLockedResizeRect( drag, clientX, clientY, imageSize, bounds, normalizedRatio ): NormalizedRect`

Computes a new crop rect during aspect-ratio-locked resize.

### Types

| Type | Description |
|------|-------------|
| `CropperState` | `{ image, crop, zoom, rotation, flip, cropRect }` |
| `CropperAction` | Union of all reducer actions |
| `CropperProps` | Props for the `<Cropper>` component |
| `StencilProps` | Contract for pluggable stencil components |
| `TransformOperation` | `{ type: 'crop' \| 'rotate' \| 'flip' \| 'zoom', ... }` |
| `NormalizedPoint` | `{ x: number, y: number }` in [0,1] space |
| `NormalizedRect` | `{ x, y, width, height }` in [0,1] space |
| `PixelPoint` / `PixelRect` | Same shapes in pixel space |
| `Size` | `{ width: number, height: number }` |
| `Flip` | `{ horizontal: boolean, vertical: boolean }` |
| `Camera` | `mat2d` (gl-matrix 2D affine matrix) |
| `SourceRegion` | `{ x, y, width, height, rotation, flip, zoom }` in source pixels |
| `SourceRegionPercent` | `{ x, y, width, height }` as percentages (0–100) |
| `InteractionControllerOptions` | Options for `InteractionController` constructor |
| `InteractionStatus` | `{ isDragging: boolean, isZooming: boolean }` |
| `AspectRatioPreset` | `{ label: string, value: number }` |

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MIN_ZOOM` | `1` | Minimum zoom level |
| `MAX_ZOOM` | `10` | Maximum zoom level |
| `MAX_ROTATION_OFFSET` | `45` | Maximum fine rotation offset (degrees) |
| `DEFAULT_STATE` | — | Default `CropperState` |
| `DEFAULT_CROP_RECT` | `{ x: 0, y: 0, width: 1, height: 1 }` | Full image |
| `DEFAULT_ASPECT_RATIOS` | Array | Preset aspect ratios (Free, Original, 1:1, 16:9, etc.) |
| `ORIGINAL_ASPECT_RATIO` | `-1` | Sentinel value for "use image's original ratio" |
| `MIN_CROP_SIZE` | `0.05` | Minimum crop dimension (5% of visual area) |
