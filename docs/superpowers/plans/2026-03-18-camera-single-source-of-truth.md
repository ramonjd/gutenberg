# Camera as Single Source of Truth — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `createCamera` the single source of truth for all coordinate transforms in image-cropper-next.

**Architecture:** `cropper.tsx` creates the camera once per render and passes it down. Stencil, overlays, and interaction all use camera functions instead of manual math. Restriction uses the camera's inverse. `use-container-fit.ts` is eliminated.

**Tech Stack:** gl-matrix (mat2d, vec2), React hooks, CSS matrix()

**UX Priority:** Every change must preserve exact visual behavior. The cropper must be consistent — no image edge showing inside the crop area, no invisible gutters, no jerky movement. Test at 0°, 45°, 90°, 180°, 270° with various zoom levels after each task.

---

### Task 1: Rewrite restrictPanZoom to use the camera's inverse

The core fix. Replace the manual alpha/beta trig with camera-based projection.

**Files:**
- Modify: `packages/image-cropper-next/src/core/camera.ts`
- Test: `packages/image-cropper-next/src/core/test/camera.ts`

- [ ] **Step 1: Write the failing test**

Add a test that builds a camera, transforms crop corners through the inverse, and asserts they're inside [0,1]×[0,1] after restriction. Use the existing `verifyImageCoversCrop` pattern but have the restriction function itself use the camera internally.

```typescript
it( 'restrictPanZoom: crop corners in world space are inside [0,1] after restriction', () => {
    const state = makeState( { rotation: 45, zoom: 2, crop: { x: 5, y: 5 } } );
    const result = restrictPanZoom( state, IMAGE, state.cropRect );
    const correctedState = { ...state, crop: result.crop, zoom: result.zoom };
    const camera = createCamera( correctedState, CONTAINER, IMAGE );
    const inv = mat2d.create();
    mat2d.invert( inv, camera );
    // All 4 crop corners should map to world points inside [0,1]
    const corners = [
        [ state.cropRect.x, state.cropRect.y ],
        [ state.cropRect.x + state.cropRect.width, state.cropRect.y ],
        [ state.cropRect.x + state.cropRect.width, state.cropRect.y + state.cropRect.height ],
        [ state.cropRect.x, state.cropRect.y + state.cropRect.height ],
    ];
    // ... transform through cropRectToScreenBounds then screenToWorld, check bounds
} );
```

- [ ] **Step 2: Run test to verify it fails or passes with current impl**

Run: `npm run test:unit -- --testPathPattern="camera"`

- [ ] **Step 3: Rewrite restrictPanZoom**

Replace the body of `restrictPanZoom` with:
1. Compute min zoom via `getMinZoomForCover` (keep as-is)
2. Build a zero-pan camera: `createCamera({ ...state, crop: { x: 0, y: 0 }, zoom }, containerSize, imageSize)` — but we don't have containerSize. **Key decision:** `restrictPanZoom` needs containerSize now, or it needs to build a camera using a reference container. Since the restriction is about world-space coverage (not pixels), we can use a canonical container (e.g., 1000×1000) — the coverage check is scale-invariant.
3. Transform crop rect corners to screen space via camera
4. Transform those screen points back through the inverse camera to get world points
5. Find the max violation outside [0,1]
6. Compute correction in screen space, convert to pan-field delta

- [ ] **Step 4: Delete `getVisualDimensions`**

Remove the function and all references. The camera encodes this.

- [ ] **Step 5: Run all tests**

Run: `npm run test:unit -- packages/image-cropper-next/`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add packages/image-cropper-next/src/core/camera.ts packages/image-cropper-next/src/core/test/camera.ts
git commit -m "refactor(image-cropper-next): rewrite restrictPanZoom to use camera inverse"
```

---

### Task 2: Eliminate use-container-fit.ts — move ResizeObserver to cropper.tsx

**Files:**
- Modify: `packages/image-cropper-next/src/components/cropper.tsx`
- Delete: `packages/image-cropper-next/src/hooks/use-container-fit.ts`
- Delete: `packages/image-cropper-next/src/hooks/test/use-container-fit.ts`
- Modify: `packages/image-cropper-next/src/hooks/index.ts`

- [ ] **Step 1: Move ResizeObserver logic into cropper.tsx**

The `useContainerFit` hook does two things:
1. ResizeObserver → `containerSize` (keep this, inline in cropper.tsx)
2. `getImageStyle` → fitted image dimensions (replace with camera)

Move just the ResizeObserver + containerRef into `cropper.tsx`. The `getImageStyle` logic becomes a small helper that derives `<img>` width/height from the camera's internal fit (or recompute the 4 lines of contain-fit math once in cropper.tsx since the `<img>` element needs unrotated dimensions).

- [ ] **Step 2: Remove visualImageSize and renderedImageSize**

These intermediate values are no longer needed. The camera encodes both. Remove them from `cropper.tsx`.

- [ ] **Step 3: Delete use-container-fit.ts and its test**

- [ ] **Step 4: Update hooks/index.ts barrel export**

Remove `useContainerFit` export.

- [ ] **Step 5: Run all tests**

Run: `npm run test:unit -- packages/image-cropper-next/`

- [ ] **Step 6: Commit**

---

### Task 3: Replace use-transform-style.ts with camera extraction

**Files:**
- Modify: `packages/image-cropper-next/src/hooks/use-transform-style.ts`
- Modify: `packages/image-cropper-next/src/hooks/test/use-transform-style.ts`
- Modify: `packages/image-cropper-next/src/components/cropper.tsx`

- [ ] **Step 1: Change useTransformStyle to accept camera mat2d**

The camera maps world [0,1] to screen pixels. The CSS transform is applied relative to the `<img>` element center. We need to extract the rotation+zoom+flip part (the 2×2 submatrix `a, b, c, d`) and the translation relative to the element's centered position.

The simplest approach: the camera's `tx, ty` values (indices 4, 5) give the translation from container origin. The `<img>` is positioned at `(containerW/2 - imgW/2, containerH/2 - imgH/2)`. The CSS transform-origin is element center. So the CSS `matrix(a, b, c, d, e, f)` where `a,b,c,d` come from camera indices `[0,1,2,3]` and `e,f` are the pan offsets (camera tx/ty minus container-center, since the element is already centered).

Actually simpler: `cropper.tsx` positions the image at its centered location. The CSS transform just needs the rotation+flip+zoom+pan part. We can compute `e = crop.x * visualW` and `f = crop.y * visualH` — but we're trying to eliminate `visualW/H`. Instead, take the camera matrix and subtract the container-centering and fit-scaling to get just the transform relative to element center.

Or even simpler: make `useTransformStyle` take the camera and the image element position, and compute the CSS transform as `camera * inverse(elementPositionMatrix)`.

- [ ] **Step 2: Update tests**

- [ ] **Step 3: Update cropper.tsx to pass camera**

- [ ] **Step 4: Run all tests**

- [ ] **Step 5: Commit**

---

### Task 4: Stencil and overlays use cropRectToScreenBounds

**Files:**
- Modify: `packages/image-cropper-next/src/components/stencils/rectangle-stencil.tsx`
- Modify: `packages/image-cropper-next/src/components/overlays/dimming-overlay.tsx`
- Modify: `packages/image-cropper-next/src/components/overlays/grid-overlay.tsx`
- Modify: `packages/image-cropper-next/src/core/types.ts` (StencilProps)
- Modify: `packages/image-cropper-next/src/components/cropper.tsx`

- [ ] **Step 1: Update StencilProps**

Replace `imageSize: Size` with `camera: Camera` in `StencilProps`. Keep `containerSize` (needed for the stencil's own layout).

- [ ] **Step 2: Update rectangle-stencil.tsx**

Replace:
```typescript
const offsetX = ( containerSize.width - imageSize.width ) / 2;
const left = offsetX + cropRect.x * imageSize.width;
```
With:
```typescript
const bounds = cropRectToScreenBounds( camera, cropRect );
const left = bounds.left;
const top = bounds.top;
const width = bounds.width;
const height = bounds.height;
```

The handle drag delta conversion also needs updating — use `screenToWorld` instead of dividing by `imageSize`.

- [ ] **Step 3: Update dimming-overlay.tsx and grid-overlay.tsx**

Same pattern: replace manual offset math with `cropRectToScreenBounds`.

- [ ] **Step 4: Update cropper.tsx**

Pass `camera` instead of `visualImageSize` to stencil and overlays.

- [ ] **Step 5: Run all tests**

- [ ] **Step 6: Visual verification in Storybook**

Test at 0°, 45°, 90°, 180° with zoom 1 and 1.5. Crop handles, dimming, and grid must align exactly with the image.

- [ ] **Step 7: Commit**

---

### Task 5: use-interaction.ts uses screenToWorld for deltas

**Files:**
- Modify: `packages/image-cropper-next/src/hooks/use-interaction.ts`
- Modify: `packages/image-cropper-next/src/hooks/test/use-interaction.ts`

- [ ] **Step 1: Pass camera to useInteraction**

Add `camera: Camera` parameter (or derive it internally from state + containerSize + imageSize).

- [ ] **Step 2: Replace manual delta math with screenToWorld**

For mouse drag:
```typescript
// Before:
const deltaX = (moveEvent.clientX - drag.startX) / panSize.width;
// After:
const startWorld = screenToWorld(camera, { x: drag.startX, y: drag.startY });
const nowWorld = screenToWorld(camera, { x: moveEvent.clientX, y: moveEvent.clientY });
// The world delta IS the pan delta (with sign adjustment)
```

Note: `screenToWorld` expects coordinates relative to container, not viewport. Need to subtract container's bounding rect.

- [ ] **Step 3: Remove imageSize parameter**

The hook no longer needs `imageSize` or `visualImageSize` — the camera encodes this.

- [ ] **Step 4: Update tests**

- [ ] **Step 5: Run all tests**

- [ ] **Step 6: Commit**

---

### Task 6: Final cleanup — remove dead code, update exports

**Files:**
- Modify: `packages/image-cropper-next/src/core/camera.ts`
- Modify: `packages/image-cropper-next/src/hooks/index.ts`
- Modify: `packages/image-cropper-next/src/components/cropper.tsx`
- Modify: `packages/image-cropper-next/src/index.ts`

- [ ] **Step 1: Remove dead exports from camera.ts**

- `worldToScreenRect` (alias for `cropRectToScreenBounds` — keep one)
- Any remaining `getVisualDimensions` references

- [ ] **Step 2: Grep for orphaned imports**

```bash
grep -r "visualImageSize\|renderedImageSize\|getImageStyle\|useContainerFit\|getVisualDimensions" packages/image-cropper-next/src/
```

Fix any remaining references.

- [ ] **Step 3: Run full test suite**

Run: `npm run test:unit -- packages/image-cropper-next/`

- [ ] **Step 4: Run lint**

Run: `npm run lint:js -- packages/image-cropper-next/`

- [ ] **Step 5: Visual verification in Storybook**

Full test checklist:
- Load image, verify centered display
- Pan at 0°, 45°, 90° — image must never leave crop area
- Zoom in/out — smooth, crop always covered
- Rotate 90° increments — no jump or flicker
- Rotate to arbitrary angles (slider) — smooth
- Flip horizontal/vertical — no jump
- Resize crop handles — smooth, stays within bounds
- Aspect ratio lock — 1:1 produces a visual square
- Export — verify cropped output matches preview

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(image-cropper-next): final cleanup — camera is single source of truth"
```
