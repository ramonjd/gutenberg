# UX Personas and User Journeys

## User Roles

### 1. Small business owner / blogger

- Uploads product photos or blog images
- Needs: crop to fit their theme's aspect ratio, straighten a slightly tilted photo, zoom to focus on product
- Skill level: low — must be obvious how to use
- Default experience: fixed-crop mode (no freeform handles)
- Pain point: "I just want it to look right in my layout"

### 2. Real estate agent / property manager

- Uploads many property photos per listing
- Needs: crop, straighten horizon lines, brightness/contrast, batch processing
- Skill level: medium — comfortable with tools but doesn't want to learn Photoshop
- Extension opportunities: AI auto-straighten (detect horizon), batch crop presets, media processing library for brightness/exposure

### 3. Content creator / influencer

- Uploads carefully curated images
- Needs: precise cropping for social media formats (1:1 Instagram, 16:9 YouTube, 9:16 Stories), AI touch-ups (skin smoothing, background blur, object removal), filters
- Skill level: high but expects a polished, app-like experience
- Extension opportunities: social media aspect ratio presets, AI enhancement via `getSourceRegion()`, filter chains via `applyToCanvas()`

### 4. Photographer / artist

- Uploads high-resolution work
- Needs: precise freeform cropping, fine rotation, maintaining image quality, non-destructive workflow, undo/redo
- Skill level: expert — wants full control
- Extension opportunities: pipeline API for non-destructive editing, keyboard shortcuts, high-res export with quality control

### 5. Accessibility-focused publisher (government, education, nonprofit)

- Must meet WCAG compliance
- Needs: the tool itself to be fully keyboard-navigable and screen-reader compatible, alt text management
- Skill level: varies, but the tool must be usable without a mouse
- Extension opportunities: keyboard handle resize (implemented), ARIA announcements (implemented), future guided crop suggestions ("this image contains faces, suggested crop keeps all faces visible")

### 6. Store owner / e-commerce manager

- Uploads product images that need consistent dimensions
- Needs: forced aspect ratios, center-on-subject cropping, white balance correction, background removal
- Skill level: medium — processes many images, values efficiency
- Extension opportunities: AI subject detection for auto-crop, background removal via `getSourceRegion()` + AI API, preset aspect ratios per product type

### 7. Developer building a plugin / custom editor

- Integrates the cropper into their own tool
- Needs: clean API, pluggable stencil system, state management compatible with their stack, documentation
- Skill level: expert developer, potentially low image-editing domain knowledge
- Extension opportunities: custom stencils, pipeline API, `onStateChange`, JSON schemas

### 8. AI agent (automated)

- Receives an image and instructions ("crop to focus on the building", "straighten and export as WebP")
- Needs: pipeline API, `getSourceRegion()`, JSON schemas for operation discovery, `stateFromPipeline()` for headless processing
- Skill level: N/A (machine) — needs deterministic, serializable API
- Extension opportunities: AI auto-crop endpoint returning `TransformOperation[]`

## Insights

| Insight | Implication |
|---------|-------------|
| Most users (1, 2, 6) just want simple crop + straighten | Fixed-crop mode as default is correct. Freeform is a power feature |
| Social media presets are a common need (3) | Aspect ratio presets should be easy to offer and extend |
| Brightness/contrast is the most-requested "next step" (2, 3, 6) | `applyToCanvas()` is the right bridge. The media processing library fills this |
| AI auto-crop / auto-straighten is high value (2, 6, 8) | `getSourceRegion()` + pipeline API make this possible without changing the core |
| Batch processing matters for power users (2, 6) | `stateFromPipeline()` on multiple images already supports this |
| Accessibility is non-negotiable for some users (5) | Keyboard and screen reader support covers the basics |
| Developers need clean docs more than features (7) | The extensibility guide and JSON schemas are the right investment |

## Refinement Ideas

### Aspect ratio presets (implemented)

Named presets: "Original", "Square (1:1)", "Landscape (16:9)", "Portrait (9:16)", "Classic (4:3)". The preset list is configurable — consumers pass their own array of `{ label, value }` pairs. The component provides sensible defaults but doesn't force them. Serves users 1-3, 6.

### Auto-straighten button (future)

A single "Straighten" button that detects the horizon and applies a small rotation. Uses AI or edge detection via `getSourceRegion()` + external API. Serves users 1, 2, 5.

### Reset to original

Prominent "Reset" that clears all transforms. Every user needs this as a safety net. Already supported via `reset()` in `useCropperState`.

### Export quality indicator (future)

Show the output resolution so the user knows if they're cropping too aggressively. Can be derived from `getSourceRegion()` which returns the source-pixel dimensions. Serves users 4, 6.

### Guided crop suggestions (future)

AI analyzes the image and suggests crop regions: "Keep all faces visible", "Center on subject", "Rule of thirds". Returns `TransformOperation[]` that the user can accept or dismiss. Serves users 1, 2, 5, 6.
