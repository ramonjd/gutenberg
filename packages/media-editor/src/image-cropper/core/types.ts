import type { mat2d } from 'gl-matrix';

/**
 * A 2D camera represented as a 2×3 affine transformation matrix (`mat2d`).
 *
 * This is not a camera object with properties — it's a raw 6-element matrix
 * `[a, b, c, d, tx, ty]` that maps normalized world coordinates [0,1] to
 * screen pixels. It composes pan, rotation, flip, zoom, and contain-fit
 * into a single transform.
 *
 * Use `createCamera()` to build one from `CropperState`, then pass it to
 * `worldToScreen()` / `screenToWorld()` for coordinate conversion.
 *
 * A 3D camera would use `mat4`; this is strictly 2D (no perspective).
 */
export type Camera = mat2d;

/**
 * A point with normalized coordinates (0-1 range relative to image dimensions).
 */
export interface NormalizedPoint {
	x: number;
	y: number;
}

/**
 * A rectangle with normalized coordinates (0-1 range).
 * Origin is the top-left corner of the image.
 */
export interface NormalizedRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Width and height dimensions.
 */
export interface Size {
	width: number;
	height: number;
}

/**
 * Flip state for horizontal and vertical axes.
 */
export interface Flip {
	horizontal: boolean;
	vertical: boolean;
}

/**
 * A JSON-serializable transform operation for the non-destructive pipeline.
 */
export type TransformOperation =
	| { type: 'crop'; rect: NormalizedRect }
	| { type: 'rotate'; degrees: number }
	| { type: 'flip'; direction: 'horizontal' | 'vertical' }
	| { type: 'zoom'; factor: number };

/**
 * Full cropper state.
 */
export interface CropperState {
	/** The source image information. Null until an image is loaded. */
	image: {
		src: string;
		naturalWidth: number;
		naturalHeight: number;
	} | null;
	/** Pan offset in normalized coordinates. */
	crop: NormalizedPoint;
	/** Zoom level. 1 = no zoom. */
	zoom: number;
	/** Rotation in degrees, normalized to 0-360. */
	rotation: number;
	/** Flip state. */
	flip: Flip;
	/** The crop rectangle in normalized coordinates. */
	cropRect: NormalizedRect;
}

/**
 * Actions for the cropper reducer.
 */
export type CropperAction =
	| { type: 'SET_IMAGE'; payload: CropperState[ 'image' ] }
	| { type: 'SET_CROP'; payload: NormalizedPoint }
	| { type: 'SET_ZOOM'; payload: number }
	| {
			type: 'SET_ZOOM_AT_POINT';
			payload: { zoom: number; crop: { x: number; y: number } };
	  }
	| { type: 'SET_ROTATION'; payload: number }
	| { type: 'SNAP_ROTATE_90'; payload: { direction: 1 | -1 } }
	| { type: 'SET_FLIP'; payload: Flip }
	| { type: 'SET_CROP_RECT'; payload: NormalizedRect }
	| { type: 'SETTLE_CROP' }
	| { type: 'APPLY_OPERATION'; payload: TransformOperation }
	| { type: 'RESET'; payload?: Partial< CropperState > };

/**
 * The contract for a pluggable stencil component.
 * Stencils render the crop area overlay and handle resize interactions.
 */
export interface StencilProps {
	/** The current crop rectangle in normalized coordinates. */
	cropRect: NormalizedRect;
	/** The container element dimensions in pixels. */
	containerSize: Size;
	/** The rendered image dimensions in pixels within the container. */
	imageSize: Size;
	/** Callback when the crop rectangle changes (during drag). */
	onCropChange: ( rect: NormalizedRect ) => void;
	/** Callback when a resize drag starts (pointerdown on handle). */
	onResizeStart?: () => void;
	/** Callback when a resize drag ends (mouseup after handle drag). */
	onResizeEnd?: () => void;
	/** Optional fixed aspect ratio (width / height) in pixel space. */
	aspectRatio?: number;
	/** Whether the crop handles are shown for freeform resizing. */
	freeformCrop?: boolean;
	/** CSS transition string for settle animation. */
	stencilTransition?: string;
	/** Maximum crop rect bounds based on current zoom/rotation. */
	cropBounds?: {
		minX: number;
		minY: number;
		maxX: number;
		maxY: number;
	};
}
