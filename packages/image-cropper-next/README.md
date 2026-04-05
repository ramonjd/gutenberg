# Image Cropper Next

An experimental, modular image cropper for WordPress. Designed for extensibility by themes, plugins, and AI agents.

## Installation

This is a private package. Install it within the Gutenberg monorepo:

```bash
npm install @wordpress/image-cropper-next
```

## Features

-   Rectangular crop with resize handles and aspect ratio lock
-   Fixed crop mode (react-easy-crop style) and freeform crop mode with draggable crop area
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

1. **Core** (`src/core/`) — Zero-dependency pure functions for math, camera, transforms, and export. Fully testable without React.
2. **Hooks** (`src/hooks/`) — Thin React bindings over the core layer.
3. **Components** (`src/components/`) — Rendering only. Composable via the stencil pattern.

See [docs/architecture.md](docs/architecture.md) for the data flow diagram and design decisions.

## Usage

```jsx
import { Cropper, useCropperState } from '@wordpress/image-cropper-next';

function MyEditor() {
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

### AI agent control

```typescript
import { useCropperState } from '@wordpress/image-cropper-next';

const { applyOperation } = useCropperState();

// Agent generates operations:
applyOperation( { type: 'crop', rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } } );
applyOperation( { type: 'rotate', degrees: 5 } );
applyOperation( { type: 'zoom', factor: 1.2 } );
```

## Extending

See [docs/extensibility.md](docs/extensibility.md) for the full developer guide covering:

-   Custom stencils (pluggable crop area UI)
-   Transform pipeline (AI agent integration)
-   Custom export pipelines
-   Camera system (coordinate transforms)
-   Theming and styling
-   AI integration patterns

## Contributing to this package

This is an individual package that's part of the Gutenberg project. It is currently experimental and private.

<br/><br/><p align="center"><img src="https://s.w.org/style/images/codeispoetry.png?1" alt="Code is Poetry." /></p>
