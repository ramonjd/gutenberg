# Image Cropper

An experimental, modular image cropper inside `@wordpress/media-editor`. Designed for extensibility by themes, plugins, and AI agents.

## Location

This module lives at `packages/media-editor/src/image-cropper/` and is internal to `@wordpress/media-editor`. It is not exported as a public API — consumers use it via the media editor components.

### Styles

Styles are compiled as part of `@wordpress/media-editor`'s style build. CSS classes use the `wp-media-editor-image-cropper` prefix.

## Features

-   Rectangular crop with resize handles and aspect ratio lock
-   Fixed crop mode and freeform crop mode
-   Rotate (+-45 continuous + 90 snap preserving image selection), flip, and zoom
-   Settle animation: crop auto-centers and fills height after resize, preserving image selection
-   Container-responsive (fits parent dimensions)
-   JSON-serializable transform operations (AI-agent friendly)
-   Non-destructive pipeline (undo/redo ready)
-   Canvas export with configurable MIME type
-   Crop handle bounds respect both image edges and container boundaries
-   Camera system (gl-matrix mat2d) for coordinate transforms

## Architecture

Three layers:

1. **Core** (`core/`) — Zero-dependency pure functions for math, camera, transforms, and export. Fully testable without React.
2. **Hooks** (`hooks/`) — Thin React bindings over the core layer.
3. **Components** (`components/`) — Rendering only. Composable via the stencil pattern.

See [docs/architecture.md](docs/architecture.md) for the data flow diagram and design decisions.

## Internal usage

```jsx
import { Cropper } from '../image-cropper/components/cropper';
import { useCropperState } from '../image-cropper/hooks/use-cropper-state';

function ImageEditingPanel() {
	const { state, dispatch } = useCropperState();
	return (
		<Cropper
			src="https://example.com/image.jpg"
			state={ state }
			dispatch={ dispatch }
		/>
	);
}
```

### Freeform crop with aspect ratio

```jsx
<Cropper
	src="image.jpg"
	state={ state }
	dispatch={ dispatch }
	freeformCrop
	aspectRatio={ 16 / 9 }
/>
```

## Docs

-   [docs/architecture.md](docs/architecture.md) — Data flow and design decisions
-   [docs/extensibility.md](docs/extensibility.md) — Extension points and API reference
-   [docs/migration.md](docs/migration.md) — Migration from `@wordpress/image-cropper`
-   [docs/planning/](docs/planning/) — Feature summary, UX personas, video roadmap
