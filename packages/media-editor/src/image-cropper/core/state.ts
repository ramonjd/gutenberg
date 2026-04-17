/**
 * Internal dependencies
 */
import type { CropperState, CropperAction } from './types';
import { DEFAULT_STATE, MAX_ZOOM } from './constants';
import { applyOperationToState } from './transforms/pipeline';
import { normalizeRotation, degreesToRadians } from './math/rotation';
import { restrictPanZoom, restrictCropRect } from './camera';

/**
 * Enforces containment: restricts the crop rect to fit within the
 * rotated image, computes minimum zoom, clamps zoom, and restricts
 * the pan position so the image always covers the crop area.
 * Called after every relevant state transition.
 *
 * @param state The state to enforce containment on.
 * @return The state with cropRect, zoom, and position restricted.
 */
export function enforceContainment( state: CropperState ): CropperState {
	if ( ! state.image ) {
		return state;
	}
	const imageSize = {
		width: state.image.naturalWidth,
		height: state.image.naturalHeight,
	};
	const imageAspectRatio = imageSize.width / imageSize.height;

	// 1. First bump zoom so the image can cover the crop rect as-is.
	//    This ensures that explicit crop rect changes (e.g., fixed-crop
	//    mode during rotation) get zoom accommodation, not crop shrinkage.
	const { crop: panAfterZoom, zoom } = restrictPanZoom(
		state,
		imageSize,
		state.cropRect
	);

	// 2. Now restrict the crop rect at the (possibly bumped) zoom.
	//    This handles cases where the crop rect is still too large
	//    (e.g., if zoom hit MAX_ZOOM).
	const cropRect = restrictCropRect(
		state.cropRect,
		zoom,
		state.rotation,
		imageAspectRatio
	);

	// 3. If the crop rect was shrunk, re-restrict pan for the new rect.
	let crop = panAfterZoom;
	if ( cropRect !== state.cropRect ) {
		( { crop } = restrictPanZoom(
			{ ...state, zoom, cropRect },
			imageSize,
			cropRect
		) );
	}

	if (
		crop.x === state.crop.x &&
		crop.y === state.crop.y &&
		zoom === state.zoom &&
		cropRect === state.cropRect
	) {
		return state;
	}
	return { ...state, crop, zoom, cropRect };
}

/**
 * Reducer function for cropper state management.
 *
 * Every state transition that could invalidate the containment invariant
 * (crop, zoom, rotation, cropRect, flip) is followed by enforceContainment
 * to ensure the image always covers the crop area.
 *
 * @param state  The current cropper state.
 * @param action The action to process.
 * @return The new cropper state.
 */
export function cropperReducer(
	state: CropperState,
	action: CropperAction
): CropperState {
	// Every action runs through enforceContainment to maintain the invariant:
	// the image always fully covers the crop area.
	switch ( action.type ) {
		case 'SET_IMAGE':
			return enforceContainment( {
				...state,
				image: action.payload,
			} );

		case 'SET_CROP':
			return enforceContainment( {
				...state,
				crop: action.payload,
			} );

		case 'SET_ZOOM':
			return enforceContainment( {
				...state,
				zoom: Math.min( MAX_ZOOM, Math.max( 1, action.payload ) ),
			} );

		case 'SET_ZOOM_AT_POINT':
			return enforceContainment( {
				...state,
				zoom: Math.min( MAX_ZOOM, Math.max( 1, action.payload.zoom ) ),
				crop: action.payload.crop,
			} );

		case 'SET_ROTATION': {
			// Rotate the pan vector by the rotation delta so the user's
			// framed content stays framed. This matches the SNAP_ROTATE_90
			// behavior but for arbitrary angles.
			//
			// Zoom is preserved. enforceContainment may bump it up to
			// cover the rotated crop, but we don't reset it — resetting
			// would jarringly reframe the user's selection on every tick
			// of a rotation slider. The trade-off: zoom can ratchet up
			// across a rotation session; the user can zoom back out
			// explicitly if they want.
			const newRotation = normalizeRotation( action.payload );
			const deltaRad = degreesToRadians( newRotation - state.rotation );
			const cos = Math.cos( deltaRad );
			const sin = Math.sin( deltaRad );
			const { x: px, y: py } = state.crop;
			return enforceContainment( {
				...state,
				rotation: newRotation,
				crop: {
					x: px * cos - py * sin,
					y: px * sin + py * cos,
				},
			} );
		}

		case 'SNAP_ROTATE_90': {
			// 90° snap: rotate the crop selection and pan around the
			// crop rect's center so the same image content stays selected.
			//
			// The crop rect rotates 90° around its own center: width and
			// height swap, and the top-left corner moves accordingly.
			// The pan offset (which positions the image in visual space)
			// also rotates 90° around the crop center so the user's
			// selected content stays put.
			const dir90 = action.payload.direction;
			const rot90 = normalizeRotation( state.rotation + dir90 * 90 );
			const rect = state.cropRect;
			const cx = rect.x + rect.width / 2;
			const cy = rect.y + rect.height / 2;

			// Rotate pan vector 90° around origin. For direction=1 (CW):
			//   (px, py) → (-py, px)
			// For direction=-1 (CCW):
			//   (px, py) → (py, -px)
			const newPanX = dir90 === 1 ? -state.crop.y : state.crop.y;
			const newPanY = dir90 === 1 ? state.crop.x : -state.crop.x;

			return enforceContainment( {
				...state,
				rotation: rot90,
				crop: { x: newPanX, y: newPanY },
				cropRect: {
					x: cx - rect.height / 2,
					y: cy - rect.width / 2,
					width: rect.height,
					height: rect.width,
				},
			} );
		}

		case 'SET_FLIP': {
			// Mirror the crop rect and pan so the same image content
			// stays selected after the flip. Without this, the flip
			// would mirror the image but the crop would stay in its
			// current normalized position, which would frame different
			// content than the user selected.
			//
			// The flip in the camera matrix is applied BEFORE rotation,
			// so a "horizontal" flip from the user's perspective (screen
			// space) corresponds to a reflection along the image's own
			// x-axis, which is rotated by θ on screen. To preserve
			// framing, we reflect the pan vector across the same rotated
			// axis. The reflection matrix for flipping along the x-axis
			// after rotation θ is:
			//
			//   [-cos(2θ)  -sin(2θ)]
			//   [-sin(2θ)   cos(2θ)]
			//
			// and for flipping along the y-axis after rotation θ:
			//
			//   [ cos(2θ)   sin(2θ)]
			//   [ sin(2θ)  -cos(2θ)]
			//
			// Two flips compose; combining them gives the combined
			// reflection matrix below.
			const oldFlip = state.flip;
			const newFlip = action.payload;
			const flippedH = oldFlip.horizontal !== newFlip.horizontal;
			const flippedV = oldFlip.vertical !== newFlip.vertical;
			const rect = state.cropRect;

			let panX = state.crop.x;
			let panY = state.crop.y;

			if ( flippedH !== flippedV ) {
				// Only one axis flipped: reflect pan across the
				// corresponding rotated axis.
				const twoTheta = 2 * degreesToRadians( state.rotation );
				const c = Math.cos( twoTheta );
				const s = Math.sin( twoTheta );
				if ( flippedH ) {
					// Reflect across the image's y-axis (vertical line).
					const nx = -c * panX - s * panY;
					const ny = -s * panX + c * panY;
					panX = nx;
					panY = ny;
				} else {
					// Reflect across the image's x-axis (horizontal line).
					const nx = c * panX + s * panY;
					const ny = s * panX - c * panY;
					panX = nx;
					panY = ny;
				}
			} else if ( flippedH && flippedV ) {
				// Both axes flipped: equivalent to 180° rotation of pan.
				panX = -panX;
				panY = -panY;
			}

			return enforceContainment( {
				...state,
				flip: newFlip,
				crop: { x: panX, y: panY },
				cropRect: {
					x: flippedH ? 1 - rect.x - rect.width : rect.x,
					y: flippedV ? 1 - rect.y - rect.height : rect.y,
					width: rect.width,
					height: rect.height,
				},
			} );
		}

		case 'SET_CROP_RECT':
			return enforceContainment( {
				...state,
				cropRect: action.payload,
			} );

		case 'SETTLE_CROP': {
			// After a resize drag ends: expand the crop to fill the
			// available height (maintaining its aspect ratio), center it,
			// and adjust zoom/pan so the exact same image content that
			// was visible inside the old crop is visible in the new one.
			const rect = state.cropRect;
			if ( rect.width === 0 || rect.height === 0 || ! state.image ) {
				return state;
			}

			// New crop: fill height (or width), maintain aspect ratio, center.
			const normalizedRatio = rect.width / rect.height;
			let newH = 1;
			let newW = normalizedRatio;
			if ( newW > 1 ) {
				newW = 1;
				newH = 1 / normalizedRatio;
			}

			// Scale factor: how much the crop grew.
			const s = newH / rect.height;

			// The old crop center in normalized visual space.
			const oldCx = rect.x + rect.width / 2;
			const oldCy = rect.y + rect.height / 2;

			// Zoom scales by s so the same image region fills the
			// larger crop at the same relative size.
			// Pan: the visible content center was at
			//   (cropCx - crop.x, cropCy - crop.y)
			// in visual-normalized space. After centering the crop to
			// (0.5, 0.5), the pan must place that same content at
			// the new center. Both pan and zoom scale by s because
			// the CSS translate is independent of zoom.
			return enforceContainment( {
				...state,
				zoom: state.zoom * s,
				crop: {
					x: ( state.crop.x - oldCx + 0.5 ) * s,
					y: ( state.crop.y - oldCy + 0.5 ) * s,
				},
				cropRect: {
					x: ( 1 - newW ) / 2,
					y: ( 1 - newH ) / 2,
					width: newW,
					height: newH,
				},
			} );
		}

		case 'APPLY_OPERATION':
			return enforceContainment(
				applyOperationToState( state, action.payload )
			);

		case 'RESET':
			return enforceContainment( {
				...DEFAULT_STATE,
				image: state.image,
				...action.payload,
			} );
	}
}

/**
 * Shallow comparison of key cropper state fields to determine if
 * the state has been modified from an initial snapshot.
 *
 * @param current The current cropper state.
 * @param initial The initial cropper state snapshot.
 * @return True if any tracked field differs.
 */
export function isStateDirty(
	current: CropperState,
	initial: CropperState
): boolean {
	return (
		current.crop.x !== initial.crop.x ||
		current.crop.y !== initial.crop.y ||
		current.zoom !== initial.zoom ||
		current.rotation !== initial.rotation ||
		current.flip.horizontal !== initial.flip.horizontal ||
		current.flip.vertical !== initial.flip.vertical ||
		current.cropRect.x !== initial.cropRect.x ||
		current.cropRect.y !== initial.cropRect.y ||
		current.cropRect.width !== initial.cropRect.width ||
		current.cropRect.height !== initial.cropRect.height
	);
}
