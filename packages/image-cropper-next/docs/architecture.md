# Image Cropper Next — Architecture

## Coordinate Spaces

| Space | What lives here | Coordinates |
|-------|----------------|-------------|
| **World** | Image, crop rect | Normalized 0–1, origin top-left of image |
| **Camera** | View transform (zoom, pan, rotation, flip) | A `mat2d` mapping world → screen |
| **Screen** | DOM container, mouse events, CSS | Pixels relative to container |

## Current Data Flow

The camera matrix exists but is bypassed by most of the codebase. Six independent places compute the same rotated-bounding-box geometry manually.

```mermaid
graph TD
    subgraph State["CropperState"]
        crop["crop.x, crop.y"]
        zoom["zoom"]
        rotation["rotation"]
        flip["flip"]
        cropRect["cropRect"]
    end

    subgraph SystemA["System A: Camera Matrix — mostly unused"]
        createCamera["createCamera()"]
        worldToScreen["worldToScreen()"]
        screenToWorld["screenToWorld()"]
        getVisibleBounds["getVisibleBounds()"]
        cropRectToScreenBounds["cropRectToScreenBounds()"]
    end

    subgraph SystemB["System B: Manual Trig — actual source of truth"]
        getVisualDimensions["getVisualDimensions()"]
        restrictPanZoom["restrictPanZoom()"]
        restrictCropRect["restrictCropRect()"]
        getMinZoomForCover["getMinZoomForCover()"]
    end

    subgraph Rendering["Render Path"]
        useTransformStyle["use-transform-style.ts\nmanual cos/sin → CSS matrix"]
        useContainerFit["use-container-fit.ts\nmanual rotated bounding box"]
        stencil["rectangle-stencil.tsx\nmanual offset math"]
        dimming["dimming-overlay.tsx\nmanual offset math"]
        grid["grid-overlay.tsx\nmanual offset math"]
    end

    subgraph Interaction["Interaction Path"]
        useInteraction["use-interaction.ts\nmanual delta / visualSize"]
    end

    subgraph Export["Export Path"]
        createExportCamera["createExportCamera()"]
        canvasRenderer["canvas-renderer.ts"]
    end

    State --> SystemB
    State --> useTransformStyle
    State --> useContainerFit
    SystemB --> |"restricts crop/zoom"| State

    useContainerFit --> |"visualImageSize"| stencil
    useContainerFit --> |"visualImageSize"| dimming
    useContainerFit --> |"visualImageSize"| grid
    useContainerFit --> |"visualImageSize"| useInteraction
    useContainerFit --> |"visualImageSize"| useTransformStyle

    useInteraction --> |"SET_CROP"| SystemB

    State --> createExportCamera --> canvasRenderer

    State -.-> |"only in tests"| createCamera
    createCamera -.-> worldToScreen
    createCamera -.-> screenToWorld
    createCamera -.-> getVisibleBounds
    createCamera -.-> cropRectToScreenBounds
```

### Problems with this design

1. **Two sources of truth.** The camera and the manual trig must agree on geometry. When they don't, restriction bugs appear (image edge visible inside crop area at certain rotations).
2. **Six places compute the same thing.** Rotated bounding box, visual dimensions, and coordinate offsets are computed independently in `use-transform-style`, `use-container-fit`, `rectangle-stencil`, `dimming-overlay`, `grid-overlay`, and the restriction functions.
3. **The camera is dead code.** `createCamera`, `worldToScreen`, `screenToWorld`, `getVisibleBounds`, and `cropRectToScreenBounds` are only used in tests and the export path. No hook or component calls them at render time.

## Target Data Flow

One camera matrix flows from `cropper.tsx` to every consumer. All coordinate transforms go through the camera. No duplicate geometry.

```mermaid
graph TD
    subgraph State["CropperState"]
        crop["crop.x, crop.y"]
        zoom["zoom"]
        rotation["rotation"]
        flip["flip"]
        cropRect["cropRect"]
    end

    subgraph Camera["camera.ts — single source of truth"]
        createCamera["createCamera(state, container, image)"]
        worldToScreen["worldToScreen()"]
        screenToWorld["screenToWorld()"]
        cropRectToScreenBounds["cropRectToScreenBounds()"]
        restrictPanZoom["restrictPanZoom()\nuses inverse camera"]
        restrictCropRect["restrictCropRect()\nuses inverse camera"]
        createExportCamera["createExportCamera()"]
        getMinZoomForCover["getMinZoomForCover()"]
    end

    subgraph Rendering["Render Path"]
        useTransformStyle["use-transform-style.ts\nextract CSS matrix from camera"]
        stencil["rectangle-stencil.tsx\ncropRectToScreenBounds"]
        dimming["dimming-overlay.tsx\ncropRectToScreenBounds"]
        grid["grid-overlay.tsx\ncropRectToScreenBounds"]
    end

    subgraph Interaction["Interaction Path"]
        useInteraction["use-interaction.ts\nscreenToWorld for deltas"]
    end

    subgraph Export["Export Path"]
        canvasRenderer["canvas-renderer.ts"]
    end

    State --> createCamera

    createCamera --> useTransformStyle
    createCamera --> cropRectToScreenBounds
    cropRectToScreenBounds --> stencil
    cropRectToScreenBounds --> dimming
    cropRectToScreenBounds --> grid

    createCamera --> screenToWorld --> useInteraction
    useInteraction --> |"SET_CROP"| restrictPanZoom

    createCamera --> restrictPanZoom --> |"restricts crop/zoom"| State
    createCamera --> restrictCropRect --> |"restricts cropRect"| State

    State --> createExportCamera --> canvasRenderer
```

### What gets eliminated

| Removed | Replaced by |
|---------|-------------|
| `use-container-fit.ts` | Camera encodes container fit |
| `getVisualDimensions()` | Camera matrix |
| Manual offset math in stencil + overlays | `cropRectToScreenBounds(camera, cropRect)` |
| Manual cos/sin in `use-transform-style` | Camera mat2d → CSS `matrix()` |
| `visualImageSize` prop threading | Camera prop |
| `renderedImageSize` computation | Camera |

### UX invariant

> After `restrictPanZoom`, transforming the 4 crop corners through `screenToWorld(camera, corner)` must produce world points inside [0,1]×[0,1].

This is both the restriction algorithm AND the test. If the camera says it's covered, it's covered on screen — because the camera IS the screen transform.

## File Map

```
packages/image-cropper-next/
├── src/
│   ├── index.ts                          # Public API
│   ├── core/
│   │   ├── camera.ts                     # THE source of truth — createCamera, restrict*, worldToScreen, etc.
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
│   │   └── use-transform-style.ts        # Camera → CSS matrix()
│   ├── components/
│   │   ├── cropper.tsx                   # Orchestrator — creates camera, passes down
│   │   ├── cropper.scss
│   │   ├── stencils/
│   │   │   └── rectangle-stencil.tsx     # Crop handles
│   │   └── overlays/
│   │       ├── dimming-overlay.tsx
│   │       └── grid-overlay.tsx
│   └── stories/
│       ├── rectangle-crop.story.tsx
│       └── style.css
```
