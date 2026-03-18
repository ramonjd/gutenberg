# Camera as Single Source of Truth — Image Cropper Next

**Date:** 2026-03-18
**Package:** `packages/image-cropper-next`
**Status:** Design
**Supersedes:** Sections of `2026-03-15-gl-matrix-camera-refactor-design.md` that described restriction and rendering

## Problem

The gl-matrix refactor introduced a camera matrix (`createCamera`) but the render path, interaction path, stencil, overlays, and restriction logic all bypass it. The same geometry (rotated bounding box, visual dimensions, coordinate transforms) is computed independently in 6 places:

1. `use-transform-style.ts` — manual cos/sin → CSS matrix
2. `use-container-fit.ts` — manual rotated bounding box → fitted dims
3. `rectangle-stencil.tsx` — manual `offsetX + cropRect.x * imageSize.width`
4. `dimming-overlay.tsx` — same manual offset math
5. `grid-overlay.tsx` — same manual offset math
6. `restrictPanZoom` / `restrictCropRect` — manual trig in a separate "pixel-proportional" coordinate system

The camera is only used in tests and the export path. This dual-system caused the restriction bugs at non-zero rotation: the restriction math and the render math had to agree on the same geometry and didn't always.

## Goal

Make `createCamera` the single source of truth. Every component that needs screen positions asks the camera. The restriction functions use the camera's inverse to check containment. No duplicate geometry computation.

## Data Flow

```
CropperState
    ↓
createCamera(state, containerSize, imageSize)
    ↓ camera (mat2d)
    ├─→ use-transform-style: extract CSS matrix(a,b,c,d,e,f) from camera
    ├─→ cropRectToScreenBounds(camera, cropRect) → stencil, overlays
    ├─→ screenToWorld(camera, point) → use-interaction (delta conversion)
    ├─→ restrictPanZoom (builds camera internally, projects via inverse)
    └─→ createExportCamera → canvas-renderer
```

## What Changes

### camera.ts — Restriction Rewrite

**Current:** `restrictPanZoom` manually computes `visualW`, `visualH`, rotates with `C/S` into "alpha/beta" image-local frame. Never calls `createCamera`.

**New:** `restrictPanZoom` builds a camera from the candidate state, transforms the 4 crop corners through the inverse camera, checks if they lie within [0,1]×[0,1], and computes the minimal pan correction to push them back in.

Algorithm:
1. Build camera from candidate state (with proposed pan/zoom)
2. `inv = invert(camera)`
3. For each crop corner `(cx, cy)` in normalized visual space, compute `worldPt = inv * screenPt` where `screenPt = cropRectToScreenBounds` position
4. Find how far each world point lies outside [0,1]×[0,1]
5. Compute minimal screen-space translation to fix the worst violation
6. Convert screen-space correction back to pan-field correction via the camera's linear part (the 2×2 submatrix)
7. If the crop is too large for the zoom, compute min zoom via `getMinZoomForCover` (this one stays as-is — it's a closed-form formula)

**Delete:** `getVisualDimensions()`. The camera encodes all of this.

**Keep:** `getMinZoomForCover()` — this is a simple formula that doesn't need the camera. `clampNormalized()` — trivial utility.

### use-container-fit.ts — Eliminated

**Current:** Computes rotated bounding box, fitted image dimensions, and visual image size. Returns `containerRef`, `containerSize`, `getImageStyle`.

**New:** The container measurement (`ResizeObserver` + `containerRef`) moves to `cropper.tsx` (or a minimal `useContainerSize` hook). The rest is replaced by `createCamera` which already encodes container fit, rotation, and scaling.

The `getImageStyle` function is no longer needed — the `<img>` element dimensions come from the camera's internal fit calculation. If we need the unrotated element size for the `<img>` style, we can extract it from the camera or compute it once in `cropper.tsx` (it's 4 lines of math that only depend on natural size, rotation, and container size).

### use-transform-style.ts — Extract from Camera

**Current:** Manually computes `cos`, `sin`, `sx`, `sy`, `z` → CSS `matrix(a, b, c, d, tx, ty)`.

**New:** Takes the camera `mat2d` and extracts the CSS matrix string. The camera's `[0..5]` values map directly to CSS `matrix()`, but we need to adjust for the fact that CSS transform-origin is element center while the camera maps from world origin. The simplest approach: the camera already encodes the full world-to-screen transform, so we compute the offset between element top-left and the camera's container-center reference frame, then adjust `tx`/`ty`.

Alternatively, this hook could be replaced entirely: `cropper.tsx` computes the `<img>` style directly from the camera. The image element's `left`, `top`, `width`, `height`, and `transform` are all derivable from the camera in one place.

### Stencil + Overlays — Use cropRectToScreenBounds

**Current:** Each component independently computes:
```
offsetX = (containerSize.width - imageSize.width) / 2
left = offsetX + cropRect.x * imageSize.width
```

**New:** Receive the camera as a prop. Call `cropRectToScreenBounds(camera, cropRect)` to get `{ left, top, width, height }` in screen pixels. One function call replaces 6 lines of manual math in each component.

**Prop change for StencilProps:**
- Remove: `imageSize: Size` (no longer needed)
- Add: `camera: Camera`
- Keep: `cropRect`, `containerSize`, `onCropChange`, `aspectRatio`

Similarly for overlay props.

### use-interaction.ts — Use screenToWorld

**Current:** Divides pixel deltas by `visualImageSize` to get normalized pan deltas.

**New:** Uses `screenToWorld` to convert screen positions to world positions. The delta in world space IS the delta in normalized pan space (with a sign flip and accounting for the pan's position in the transform chain).

More precisely: to convert a screen-space drag delta `(dx, dy)` to a pan delta, we compute the difference between two `screenToWorld` calls (before and after the drag), which gives us the world-space displacement. This naturally accounts for rotation, zoom, and flip without any manual trig.

### cropper.tsx — Orchestrator

**Current:** Computes `renderedImageSize`, `visualImageSize`, threads both through props to every child.

**New:** Creates the camera once per render:
```
const camera = createCamera(state, containerSize, imageSize)
```
Passes `camera` to stencil, overlays, and interaction hook. Derives the `<img>` element style directly from the camera's internal values (or a small helper). No `visualImageSize` prop threading.

## What Gets Deleted

| File/Function | Reason |
|---|---|
| `use-container-fit.ts` | Camera encodes container fit. Container measurement is trivial (ResizeObserver in cropper.tsx). |
| `getVisualDimensions()` in camera.ts | Camera matrix encodes this |
| Manual offset math in stencil + overlays | Replaced by `cropRectToScreenBounds` |
| Manual cos/sin in `use-transform-style.ts` | Extracted from camera mat2d |
| `visualImageSize` computation in `cropper.tsx` | Camera handles this |
| `renderedImageSize` computation in `cropper.tsx` | Camera handles this |

## What Stays

| Function | Why |
|---|---|
| `createCamera` | Core — composes the matrix |
| `createExportCamera` | Export path needs its own viewport |
| `worldToScreen` / `screenToWorld` | Used by interaction and restriction |
| `cropRectToScreenBounds` / `getVisibleBounds` | Used by stencil, overlays |
| `getMinZoomForCover` | Closed-form formula, independent of camera |
| `restrictCropRect` | Can be simplified to use camera, but the size-limiting math is straightforward |
| `clampNormalized` | Trivial utility |
| `normalizeRotation` / `degreesToRadians` / `radiansToDegrees` | Angle utilities |

## UX Invariant

The camera-as-source-of-truth eliminates the class of bugs where the restriction math and the render math disagree on geometry. The single invariant:

> After `restrictPanZoom`, transforming the 4 crop corners through `screenToWorld(camera, corner)` must produce world points inside [0,1]×[0,1].

This is both the restriction algorithm AND the test. If the camera says it's covered, it's covered on screen — because the camera IS the screen transform.
