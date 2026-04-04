/**
 * WordPress dependencies
 */
import { useReducer, useCallback, useRef } from '@wordpress/element';

/**
 * Internal dependencies
 */
import type {
	CropperState,
	CropperAction,
	TransformOperation,
	NormalizedPoint,
	NormalizedRect,
	Flip,
} from '../core/types';
import { DEFAULT_STATE, MAX_ZOOM } from '../core/constants';
import { applyOperationToState } from '../core/transforms/pipeline';
import { normalizeRotation } from '../core/math/rotation';
import { restrictPanZoom, restrictCropRect } from '../core/camera';
import { exportCroppedImage } from '../core/export/canvas-renderer';

/**
 * The return type of the useCropperState hook.
 */
export interface UseCropperStateReturn {
	/** The current cropper state. */
	state: CropperState;
	/** The raw dispatch function for sending actions to the reducer. */
	dispatch: React.Dispatch< CropperAction >;
	/** Set the pan offset in normalized coordinates. */
	setCrop: ( crop: NormalizedPoint ) => void;
	/** Set the zoom level. Clamped to [1, 10]. */
	setZoom: ( zoom: number ) => void;
	/** Set the rotation in degrees. Normalized to [0, 360). */
	setRotation: ( rotation: number ) => void;
	/** Set the flip state. */
	setFlip: ( flip: Flip ) => void;
	/** Snap rotate 90° preserving the image selection (Google Photos style). */
	snapRotate90: ( direction: 1 | -1 ) => void;
	/** Set the crop rectangle in normalized coordinates. */
	setCropRect: ( rect: NormalizedRect ) => void;
	/** Apply a transform operation through the pipeline. */
	applyOperation: ( op: TransformOperation ) => void;
	/** Reset the state. Optionally merge partial state overrides. */
	reset: ( resetState?: Partial< CropperState > ) => void;
	/** Whether the current state differs from the initial state. */
	isDirty: boolean;
	/** Export the cropped image as a Blob. */
	getCroppedImage: (
		mimeType?: string,
		quality?: number
	) => Promise< Blob | null >;
}

/**
 * Enforces containment: restricts the crop rect to fit within the
 * rotated image, computes minimum zoom, clamps zoom, and restricts
 * the pan position so the image always covers the crop area.
 * Called after every relevant state transition.
 *
 * @param state The state to enforce containment on.
 * @return The state with cropRect, zoom, and position restricted.
 */
function enforceContainment( state: CropperState ): CropperState {
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
function cropperReducer(
	state: CropperState,
	action: CropperAction
): CropperState {
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

		case 'SET_ROTATION':
			// Rotation: crop stays where it is, enforceContainment
			// bumps zoom so the image covers the crop.
			return enforceContainment( {
				...state,
				rotation: normalizeRotation( action.payload ),
			} );

		case 'SET_ROTATION_WITH_CONTAINER':
			// Same as SET_ROTATION — containerSize is no longer needed.
			// Kept for API compatibility; may be removed later.
			return enforceContainment( {
				...state,
				rotation: normalizeRotation( action.payload.rotation ),
			} );

		case 'SNAP_ROTATE_90': {
			// 90° snap: swap crop width↔height so the selection rotates
			// with the image (Google Photos style). Keep the same center.
			// enforceContainment bumps zoom to cover.
			const dir90 = action.payload.direction;
			const rot90 = normalizeRotation( state.rotation + dir90 * 90 );
			const cr = state.cropRect;
			const cx = cr.x + cr.width / 2;
			const cy = cr.y + cr.height / 2;
			return enforceContainment( {
				...state,
				rotation: rot90,
				cropRect: {
					x: cx - cr.height / 2,
					y: cy - cr.width / 2,
					width: cr.height,
					height: cr.width,
				},
			} );
		}

		case 'SET_FLIP':
			return enforceContainment( {
				...state,
				flip: action.payload,
			} );

		case 'SET_CROP_RECT':
			return enforceContainment( {
				...state,
				cropRect: action.payload,
			} );

		case 'SETTLE_CROP': {
			// After a resize drag ends: expand the crop to fill the
			// available height (maintaining its aspect ratio), center it,
			// and adjust zoom/pan so the same image content is visible.
			const cr = state.cropRect;
			if ( cr.width === 0 || cr.height === 0 || ! state.image ) {
				return state;
			}

			// Compute the new crop rect: fill height, maintain ratio, center.
			const normalizedRatio = cr.width / cr.height;
			let newH = 1;
			let newW = normalizedRatio;
			if ( newW > 1 ) {
				newW = 1;
				newH = 1 / normalizedRatio;
			}
			const newCropRect = {
				x: ( 1 - newW ) / 2,
				y: ( 1 - newH ) / 2,
				width: newW,
				height: newH,
			};

			// Scale factor: how much the crop grew. The zoom must grow
			// by the same factor so the same image content fills the
			// larger crop. Use the height ratio (since we fill height).
			const scaleFactor = newH / cr.height;
			const newZoom = state.zoom * scaleFactor;

			// Pan adjustment: the old crop center was at (cx, cy) in
			// normalized space. The image content at that center needs
			// to end up at the new crop center (0.5, 0.5). The pan
			// represents the image offset from center, so we need to
			// account for where the old crop center was relative to
			// the visual center.
			const oldCx = cr.x + cr.width / 2;
			const oldCy = cr.y + cr.height / 2;
			// The old crop center's offset from visual center was
			// being shown because of the current pan. In the new
			// centered crop, that offset must be absorbed into the pan.
			const newCropX = state.crop.x + ( oldCx - 0.5 );
			const newCropY = state.crop.y + ( oldCy - 0.5 );

			return enforceContainment( {
				...state,
				zoom: newZoom,
				crop: { x: newCropX, y: newCropY },
				cropRect: newCropRect,
			} );
		}

		case 'APPLY_OPERATION':
			return enforceContainment(
				applyOperationToState( state, action.payload )
			);

		case 'RESET':
			return {
				...DEFAULT_STATE,
				image: state.image,
				...action.payload,
			};
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
function isStateDirty( current: CropperState, initial: CropperState ): boolean {
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

/**
 * Reducer-based state management hook for the image cropper.
 *
 * Provides the full cropper state, a dispatch function, and
 * convenience action creators for common operations.
 *
 * @param initialState Optional partial state to merge with DEFAULT_STATE.
 * @return The cropper state, dispatch, convenience setters, and utilities.
 */
export function useCropperState(
	initialState?: Partial< CropperState >
): UseCropperStateReturn {
	const [ state, dispatch ] = useReducer(
		cropperReducer,
		initialState,
		( init ) => ( { ...DEFAULT_STATE, ...init } )
	);

	const initialRef = useRef< CropperState >( {
		...DEFAULT_STATE,
		...initialState,
	} );

	const setCrop = useCallback(
		( crop: NormalizedPoint ) => {
			dispatch( { type: 'SET_CROP', payload: crop } );
		},
		[ dispatch ]
	);

	const setZoom = useCallback(
		( zoom: number ) => {
			dispatch( { type: 'SET_ZOOM', payload: zoom } );
		},
		[ dispatch ]
	);

	const setRotation = useCallback(
		( rotation: number ) => {
			dispatch( { type: 'SET_ROTATION', payload: rotation } );
		},
		[ dispatch ]
	);

	const setFlip = useCallback(
		( flip: Flip ) => {
			dispatch( { type: 'SET_FLIP', payload: flip } );
		},
		[ dispatch ]
	);

	const snapRotate90 = useCallback(
		( direction: 1 | -1 ) => {
			dispatch( {
				type: 'SNAP_ROTATE_90',
				payload: { direction },
			} );
		},
		[ dispatch ]
	);

	const setCropRect = useCallback(
		( rect: NormalizedRect ) => {
			dispatch( { type: 'SET_CROP_RECT', payload: rect } );
		},
		[ dispatch ]
	);

	const applyOperation = useCallback(
		( op: TransformOperation ) => {
			dispatch( { type: 'APPLY_OPERATION', payload: op } );
		},
		[ dispatch ]
	);

	const reset = useCallback(
		( resetState?: Partial< CropperState > ) => {
			dispatch( { type: 'RESET', payload: resetState } );
			if ( ! resetState ) {
				initialRef.current = { ...DEFAULT_STATE };
			} else {
				initialRef.current = { ...DEFAULT_STATE, ...resetState };
			}
		},
		[ dispatch ]
	);

	const isDirty = isStateDirty( state, initialRef.current );

	const getCroppedImage = useCallback(
		( mimeType?: string, quality?: number ) => {
			if ( ! state.image ) {
				return Promise.resolve( null );
			}
			return exportCroppedImage(
				state.image.src,
				state,
				mimeType,
				quality
			);
		},
		[ state ]
	);

	return {
		state,
		dispatch,
		setCrop,
		setZoom,
		setRotation,
		setFlip,
		snapRotate90,
		setCropRect,
		applyOperation,
		reset,
		isDirty,
		getCroppedImage,
	};
}
