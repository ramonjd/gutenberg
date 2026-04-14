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

Two layers:

1. **Core** (`core/`) — Framework-agnostic pure functions for math, camera, state, interaction, transforms, and export. Zero React dependency. Usable from vanilla JS, Vue, Svelte, or any other framework.
2. **React** (`react/`) — Thin React adapter: hooks wrapping core functions, and components for rendering.

See [docs/architecture.md](docs/architecture.md) for the data flow diagram and design decisions.

## Internal usage

```jsx
import { Cropper } from '../image-cropper/react/components/cropper';
import { useCropperState } from '../image-cropper/react/hooks/use-cropper-state';

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
-   [docs/extensibility.md](docs/extensibility.md) — Extension points, API reference, and framework integration examples
-   [docs/migration.md](docs/migration.md) — Migration from `@wordpress/image-cropper`
