# Migration from @wordpress/image-cropper

This document describes the migration path from `@wordpress/image-cropper` (the react-easy-crop wrapper) to `@wordpress/image-cropper-next`.

## API comparison

| Aspect | Old (`image-cropper`) | New (`image-cropper-next`) |
|--------|----------------------|---------------------------|
| Underlying library | `react-easy-crop` | Custom, `gl-matrix` only |
| Component | `<ImageCropper>` | `<Cropper>` |
| Provider | `<ImageCropperProvider>` + `useImageCropper()` | `<CropperProvider>` + `useCropper()` |
| State hook | Internal `useCropper()` | `useCropperState()` (exported, standalone) |
| State updates | `setCropperState( partial )` — partial merge | `dispatch( action )` — reducer pattern |
| Crop coordinates | Percentages (0-100) + pixel `Area` | Normalized (0-1) `NormalizedRect` |
| Pan coordinates | `Point` (pixel offset from react-easy-crop) | `NormalizedPoint` (visual-normalized) |
| Aspect ratio | `aspectRatio` in state | `aspectRatio` prop on `<Cropper>` |
| Export | `getCroppedImage( src )` → data URL string | `getCroppedImage( mime, quality )` → Blob |
| isDirty | `dequal` deep comparison | Manual field comparison with guard test |
| Dependencies | `react-easy-crop`, `dequal` | `gl-matrix` |
| Freeform crop | Not supported | Supported (resize handles, settle animation) |
| Rotation | Relies on react-easy-crop | Custom: ±45° slider + 90° snap |
| Pipeline/undo | Not supported | `TransformOperation[]` pipeline |
| AI integration | Not supported | JSON schemas, `getSourceRegion()`, `applyToCanvas()` |

## Migration strategy: direct replacement (recommended)

The old package has one consumer: `@wordpress/block-editor`. The state models are too different for a thin adapter — react-easy-crop's `Point`/`Area`/`MediaSize` coordinate system doesn't map cleanly to our normalized [0,1] coordinates.

The recommended approach is a direct replacement in `block-editor` when ready:

### Step 1: Add dependency

In `packages/block-editor/package.json`, add `@wordpress/image-cropper-next` alongside the existing `@wordpress/image-cropper`:

```json
{
  "dependencies": {
    "@wordpress/image-cropper": "file:../image-cropper",
    "@wordpress/image-cropper-next": "file:../image-cropper-next"
  }
}
```

### Step 2: Build the new integration

Create the new image editing UI using `image-cropper-next`. This can be built and tested in parallel with the existing integration:

```tsx
// Old pattern:
import { ImageCropper, ImageCropperProvider, useImageCropper } from '@wordpress/image-cropper';

function OldEditor() {
  return (
    <ImageCropperProvider>
      <ImageCropper src={ imageUrl } onLoad={ handleLoad } />
      <OldToolbar />
    </ImageCropperProvider>
  );
}

// New pattern:
import { Cropper, useCropperState } from '@wordpress/image-cropper-next';

function NewEditor() {
  const { state, dispatch, setZoom, setRotation, snapRotate90, reset } =
    useCropperState();
  return (
    <div>
      <NewToolbar state={ state } ... />
      <Cropper
        src={ imageUrl }
        state={ state }
        dispatch={ dispatch }
        freeformCrop
        onImageLoaded={ handleLoad }
      />
    </div>
  );
}
```

### Step 3: Coordinate conversion (if needed)

If existing code stores crop data in the old format (percentage-based `Area`), convert at the boundary:

```typescript
// Old Area (percentage 0-100) → New NormalizedRect (0-1):
function areaToNormalizedRect( area: Area ): NormalizedRect {
  return {
    x: area.x / 100,
    y: area.y / 100,
    width: area.width / 100,
    height: area.height / 100,
  };
}

// New NormalizedRect → Old Area:
function normalizedRectToArea( rect: NormalizedRect ): Area {
  return {
    x: rect.x * 100,
    y: rect.y * 100,
    width: rect.width * 100,
    height: rect.height * 100,
  };
}
```

### Step 4: Export conversion

The old `getCroppedImage()` returns a data URL string. The new one returns a Blob:

```typescript
// Old:
const dataUrl = await getCroppedImage( src );  // string | null

// New:
const blob = await getCroppedImage( 'image/jpeg', 0.9 );  // Blob | null

// If you need a data URL from the new API:
import { canvasToDataURL, renderToCanvas, loadImage } from '@wordpress/image-cropper-next';
const image = await loadImage( src );
const canvas = renderToCanvas( image, state );
const dataUrl = canvasToDataURL( canvas, 'image/jpeg', 0.9 );
```

### Step 5: Switch the integration

Once the new integration is tested:

1. Replace `ImageCropper`/`ImageCropperProvider` with `Cropper`/`useCropperState` in `block-editor`
2. Remove `@wordpress/image-cropper` from `block-editor`'s dependencies
3. Update any stored crop metadata to use normalized coordinates

### Step 6: Deprecate the old package

1. Add a deprecation notice to `@wordpress/image-cropper`'s README
2. Mark all exports with `@deprecated` JSDoc tags
3. Add a console warning on first use pointing to `@wordpress/image-cropper-next`
4. Keep the old package in the monorepo for at least one major release cycle
5. Remove after the deprecation period

## Key differences to watch for

### State is external in the new package

The old package manages state internally via `ImageCropperProvider`. The new package's state is managed by the consumer via `useCropperState()` — you own the state, not the component. This is more flexible but means:

- You must pass `state` and `dispatch` to `<Cropper>`
- State persists across component mounts/unmounts (if you keep the hook mounted)
- Multiple components can observe/modify the same state

### Aspect ratio is a prop, not state

Old: `cropperState.aspectRatio` is part of the state, set via `setCropperState( { aspectRatio: 1 } )`.

New: `aspectRatio` is a prop on `<Cropper>`. To change it, update the prop. The component handles the crop rect adjustment internally.

### No `croppedAreaPixels`

The old package stores `croppedAreaPixels` (from react-easy-crop's `onCropComplete`). The new package doesn't — instead, use `getSourceRegion( state, imageSize )` to get source-pixel coordinates on demand.

### Containment is automatic

The old package relies on react-easy-crop's built-in containment. The new package's `enforceContainment()` runs after every state change in the reducer — you don't need to manually enforce bounds.

## Timeline

1. **Now**: Both packages coexist. `image-cropper-next` is experimental and private.
2. **Integration**: `block-editor` builds new image editing UI using `image-cropper-next`.
3. **Switch**: Old integration removed, new one activated.
4. **Deprecation**: `@wordpress/image-cropper` marked deprecated with console warning.
5. **Removal**: Old package removed after deprecation period (one major release cycle minimum).
