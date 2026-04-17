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

## Styles

The cropper's styles are compiled as part of `@wordpress/media-editor`'s SCSS build and output to `build-style/style.css`. Consumers that already load `@wordpress/media-editor`'s stylesheet (e.g. via `wp_enqueue_style( 'wp-media-editor' )` in WordPress or `import '@wordpress/media-editor/build-style/style.css'` in JS bundles) will automatically get the cropper styles.

If you're using the cropper components without the rest of the media editor, you still need to load the package's stylesheet — the cropper will not render correctly without it. All CSS classes use the `wp-media-editor-image-cropper` prefix, so themes can override styles with equal or higher specificity.

## Docs

-   [docs/architecture.md](docs/architecture.md) — Data flow, coordinate spaces, and design decisions
-   [docs/recipes.md](docs/recipes.md) — Getting started walkthrough, extension points, and integration patterns
-   [docs/roadmap.md](docs/roadmap.md) — Planned follow-up work and phases

## API Reference

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
| `showDimming` | `boolean` | `true` | Dimming overlay outside crop |
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

### React hooks

#### `useCropperState( initialState?: Partial<CropperState> ): UseCropperStateReturn`

State management hook. Returns:

Prefer the convenience setters (`setCrop`, `setZoom`, etc.) for most use cases. `dispatch` is exposed as an escape hatch but may be hidden in a future version — see [docs/roadmap.md](docs/roadmap.md).

| Field | Type | Description |
|-------|------|-------------|
| `state` | `CropperState` | Current state |
| `dispatch` | `Dispatch<CropperAction>` | Raw reducer dispatch (escape hatch — prefer setters) |
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

### Source region

#### `getSourceRegion( state, imageSize ): SourceRegion`

Converts crop state to source-pixel coordinates: `{ x, y, width, height, rotation, flip, zoom }`. For server-side processing (FFmpeg, ImageMagick, etc.).

#### `getSourceRegionPercent( state, imageSize ): SourceRegionPercent`

Same as `getSourceRegion` but returns percentages (0–100): `{ x, y, width, height }`. Compatible with the WordPress REST API attachments `/edit` endpoint.

### Export

#### `exportCroppedImage( src, state, mimeType?, quality? ): Promise<Blob>`

End-to-end: load image, render with transforms, export as Blob.

#### `applyToCanvas( source: CanvasImageSource, imageSize, state ): HTMLCanvasElement`

Applies transforms to any `CanvasImageSource` (image, canvas, video frame, offscreen canvas). For multi-step editing pipelines.

### Pipeline

#### `stateFromPipeline( operations: TransformOperation[] ): CropperState`

Replays a sequence of operations from default state. Pure function, no DOM needed. For headless/server-side processing.

#### `applyOperationToState( state, operation ): CropperState`

Applies a single operation to an existing state.

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
| `Size` | `{ width: number, height: number }` |
| `Flip` | `{ horizontal: boolean, vertical: boolean }` |
| `SourceRegion` | `{ x, y, width, height, rotation, flip, zoom }` in source pixels |
| `SourceRegionPercent` | `{ x, y, width, height }` as percentages (0–100) |
| `AspectRatioPreset` | `{ label: string, value: number }` |

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_STATE` | — | Default `CropperState` |
| `DEFAULT_ASPECT_RATIOS` | Array | Preset aspect ratios (Free, Original, 1:1, 16:9, etc.) |
| `ORIGINAL_ASPECT_RATIO` | `-1` | Sentinel value for "use image's original ratio" |
