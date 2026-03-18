# Image Cropper Next — Architecture

## Coordinate Spaces

| Space | What lives here | Coordinates |
|-------|----------------|-------------|
| **World** | Image, crop rect | Normalized 0–1, origin top-left of image |
| **Camera** | View transform (zoom, pan, rotation, flip) | A `mat2d` mapping world → screen |
| **Screen** | DOM container, mouse events, CSS | Pixels relative to container |

## Data Flow

The camera is the source of truth for restriction (ensuring the image covers the crop). The render path uses lightweight manual math for CSS transforms and stencil positioning — these are simple, correct, and deliberately not routed through the camera to avoid prop-threading complexity.

```mermaid
graph TD
    subgraph State["CropperState"]
        crop["crop.x, crop.y"]
        zoom["zoom"]
        rotation["rotation"]
        flip["flip"]
        cropRect["cropRect"]
    end

    subgraph Camera["camera.ts — restriction source of truth"]
        createCamera["createCamera()"]
        getImageFit["getImageFit()"]
        restrictPanZoom["restrictPanZoom()\nbuilds camera → inverse → clamp"]
        restrictCropRect["restrictCropRect()"]
        getMinZoomForCover["getMinZoomForCover()"]
        createExportCamera["createExportCamera()"]
    end

    subgraph Rendering["Render Path"]
        useTransformStyle["use-transform-style.ts\ncos/sin → CSS matrix()"]
        stencil["rectangle-stencil.tsx\noffset + cropRect * visualSize"]
        dimming["dimming-overlay.tsx\noffset + cropRect * visualSize"]
        grid["grid-overlay.tsx\noffset + cropRect * visualSize"]
    end

    subgraph Interaction["Interaction Path"]
        useInteraction["use-interaction.ts\ndelta / visualSize → restrictPanZoom"]
    end

    subgraph Export["Export Path"]
        canvasRenderer["canvas-renderer.ts"]
    end

    State --> restrictPanZoom
    State --> restrictCropRect
    restrictPanZoom --> |"corrected crop/zoom"| State
    restrictCropRect --> |"corrected cropRect"| State

    State --> getImageFit
    getImageFit --> |"elementSize"| imgStyle["img element style"]
    getImageFit --> |"visualSize"| stencil
    getImageFit --> |"visualSize"| dimming
    getImageFit --> |"visualSize"| grid
    getImageFit --> |"visualSize"| useInteraction
    getImageFit --> |"visualSize"| useTransformStyle

    useInteraction --> |"SET_CROP"| State

    State --> createExportCamera --> canvasRenderer
```

### Design decisions

**Why restriction uses the camera but rendering doesn't:**
- `restrictPanZoom` builds a camera internally and projects crop corners through its inverse. This guarantees the restriction and rendering agree on geometry — the camera IS the screen transform.
- The render path (`use-transform-style`, stencils, overlays) uses simple manual math because the CSS transform operates in a different coordinate system (element-center origin vs container-center). Deriving CSS matrix from the camera mat2d would be more complex, not less.

**Why `getImageFit` exists:**
- `createCamera` needs to know the fitted image dimensions to build its matrix. `cropper.tsx` also needs them to size the `<img>` element and compute `visualSize` for overlays. `getImageFit` is the shared contain-fit calculation used by both — no duplication.

**UX invariant:**
> After `restrictPanZoom`, transforming the 4 crop corners through `screenToWorld(camera, corner)` must produce world points inside [0,1]×[0,1].

This is both the restriction algorithm AND the test. If the camera says it's covered, it's covered on screen — because the camera IS the screen transform.

## File Map

```
packages/image-cropper-next/
├── src/
│   ├── index.ts                          # Public API
│   ├── core/
│   │   ├── camera.ts                     # Camera matrix, restriction, getImageFit
│   │   ├── constants.ts                  # DEFAULT_STATE, MIN_ZOOM, MAX_ZOOM
│   │   ├── types.ts                      # CropperState, Camera, StencilProps, etc.
│   │   ├── math/
│   │   │   └── rotation.ts               # normalizeRotation, degreesToRadians, radiansToDegrees
│   │   ├── transforms/
│   │   │   └── pipeline.ts               # TransformOperation replay
│   │   └── export/
│   │       └── canvas-renderer.ts        # createExportCamera → ctx.setTransform
│   ├── hooks/
│   │   ├── use-cropper-state.ts          # Reducer, enforceContainment
│   │   ├── use-interaction.ts            # Mouse/touch/keyboard → dispatch
│   │   └── use-transform-style.ts        # State → CSS matrix()
│   ├── components/
│   │   ├── cropper.tsx                   # Orchestrator — getImageFit, passes visualSize down
│   │   ├── cropper.scss
│   │   ├── stencils/
│   │   │   └── rectangle-stencil.tsx     # Crop handles (corner-only when ratio locked)
│   │   └── overlays/
│   │       ├── dimming-overlay.tsx
│   │       └── grid-overlay.tsx
│   └── stories/
│       ├── rectangle-crop.story.tsx
│       └── style.css
```
