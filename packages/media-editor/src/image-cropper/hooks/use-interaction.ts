/**
 * WordPress dependencies
 */
import { useCallback, useRef, useState } from '@wordpress/element';

/**
 * Internal dependencies
 */
import type { CropperAction, CropperState, Size } from '../core/types';
import { MIN_ZOOM, MAX_ZOOM } from '../core/constants';
import { restrictPanZoom } from '../core/camera';

/** Time window for detecting a double-tap gesture (ms). */
const DOUBLE_TAP_TIME = 300;
/** Max distance between taps to count as a double-tap (px). */
const DOUBLE_TAP_DISTANCE = 30;
/** Duration of the zoom animation state (ms). */
const ZOOM_ANIMATION_DURATION = 200;

/**
 * Get the natural image dimensions from cropper state, falling back to 1x1.
 *
 * @param state The current cropper state.
 * @return The image dimensions.
 */
function getImageSize( state: CropperState ): {
	width: number;
	height: number;
} {
	return state.image
		? { width: state.image.naturalWidth, height: state.image.naturalHeight }
		: { width: 1, height: 1 };
}

/**
 * The return type of the useInteraction hook.
 */
export interface UseInteractionReturn {
	/** Event handler props to spread on the container element. */
	handlers: {
		onPointerDown: ( e: React.PointerEvent ) => void;
		onTouchStart: ( e: React.TouchEvent ) => void;
		onKeyDown: ( e: React.KeyboardEvent ) => void;
	};
	/** Native wheel handler — must be registered with { passive: false }. */
	onWheelNative: ( e: WheelEvent ) => void;
	/** Whether a drag (pan) interaction is in progress. */
	isDragging: boolean;
	/** Whether a double-tap zoom animation is in progress. */
	isZooming: boolean;
}

/**
 * Options for the useInteraction hook.
 */
export interface UseInteractionOptions {
	/** Minimum zoom level. Defaults to MIN_ZOOM. */
	minZoom?: number;
	/** Maximum zoom level. Defaults to MAX_ZOOM. */
	maxZoom?: number;
	/** Zoom speed multiplier for wheel events. Defaults to 0.01. */
	zoomSpeed?: number;
	/** Pan step size in normalized coords for keyboard events. Defaults to 0.05. */
	keyboardStep?: number;
	/** Zoom level for double-tap zoom. Defaults to 2. */
	doubleTapZoom?: number;
}

/**
 * Get the distance between two touch points.
 *
 * @param t1 The first touch.
 * @param t2 The second touch.
 * @return The pixel distance between the two touches.
 */
function getTouchDistance( t1: React.Touch, t2: React.Touch ): number {
	const dx = t1.clientX - t2.clientX;
	const dy = t1.clientY - t2.clientY;
	return Math.sqrt( dx * dx + dy * dy );
}

/**
 * Mouse, touch, and keyboard event handling for pan, zoom,
 * and crop manipulation.
 *
 * Returns event handler props to spread on the container element.
 * Uses requestAnimationFrame for drag/pinch updates to avoid
 * layout thrashing.
 *
 * @param state         The current cropper state.
 * @param dispatch      The dispatch function for cropper actions.
 * @param containerSize The container dimensions in pixels.
 * @param imageSize     The rendered image dimensions in pixels.
 * @param options       Optional configuration for zoom and keyboard behavior.
 * @return Event handler props for the container element.
 */
export function useInteraction(
	state: CropperState,
	dispatch: React.Dispatch< CropperAction >,
	containerSize: Size,
	imageSize?: Size,
	options?: UseInteractionOptions
): UseInteractionReturn {
	const minZoom = options?.minZoom ?? MIN_ZOOM;
	const maxZoom = options?.maxZoom ?? MAX_ZOOM;
	const zoomSpeed = options?.zoomSpeed ?? 0.01;
	const keyboardStep = options?.keyboardStep ?? 0.05;
	const doubleTapZoom = options?.doubleTapZoom ?? 2;

	const stateRef = useRef( state );
	stateRef.current = state;

	const dragRef = useRef< {
		startX: number;
		startY: number;
		startCropX: number;
		startCropY: number;
	} | null >( null );

	const [ isDragging, setIsDragging ] = useState( false );
	const [ isZooming, setIsZooming ] = useState( false );
	const zoomTimerRef = useRef< ReturnType< typeof setTimeout > >();
	const rafRef = useRef< number >( 0 );

	const touchRef = useRef< {
		startDistance: number;
		startZoom: number;
		lastTouchX: number;
		lastTouchY: number;
		startCropX: number;
		startCropY: number;
		isSingleTouch: boolean;
		containerRect?: DOMRect;
	} | null >( null );

	const touchCleanupRef = useRef< ( () => void ) | null >( null );
	const lastTapRef = useRef< {
		time: number;
		x: number;
		y: number;
	} | null >( null );

	const onPointerDown = useCallback(
		( e: React.PointerEvent ) => {
			// Only handle primary button (left click / first touch).
			if ( e.button !== 0 ) {
				return;
			}
			e.preventDefault();

			// Grab the native DOM element before React nullifies currentTarget.
			const el = e.currentTarget as HTMLElement;

			// Blur any focused handle so its focus ring doesn't linger.
			const ownerDoc = el.ownerDocument;
			if ( ownerDoc?.activeElement instanceof HTMLElement ) {
				ownerDoc.activeElement.blur();
			}

			// Capture pointer so drag works across iframe boundaries.
			el.setPointerCapture( e.pointerId );

			setIsDragging( true );
			const currentState = stateRef.current;
			dragRef.current = {
				startX: e.clientX,
				startY: e.clientY,
				startCropX: currentState.crop.x,
				startCropY: currentState.crop.y,
			};

			const onPointerMove = ( moveEvent: Event ) => {
				const drag = dragRef.current;
				if ( ! drag ) {
					return;
				}
				const pe = moveEvent as PointerEvent;

				cancelAnimationFrame( rafRef.current );
				rafRef.current = requestAnimationFrame( () => {
					const s = stateRef.current;
					const panSize = imageSize ?? containerSize;
					const deltaX =
						panSize.width > 0
							? ( pe.clientX - drag.startX ) / panSize.width
							: 0;
					const deltaY =
						panSize.height > 0
							? ( pe.clientY - drag.startY ) / panSize.height
							: 0;

					const { crop: newCrop } = restrictPanZoom(
						{
							...s,
							crop: {
								x: drag.startCropX + deltaX,
								y: drag.startCropY + deltaY,
							},
						},
						getImageSize( s ),
						s.cropRect
					);

					dispatch( {
						type: 'SET_CROP',
						payload: newCrop,
					} );
				} );
			};

			const onPointerUp = () => {
				setIsDragging( false );
				dragRef.current = null;
				cancelAnimationFrame( rafRef.current );
				el.removeEventListener( 'pointermove', onPointerMove );
				el.removeEventListener( 'pointerup', onPointerUp );
				el.removeEventListener( 'lostpointercapture', onPointerUp );
			};

			el.addEventListener( 'pointermove', onPointerMove );
			el.addEventListener( 'pointerup', onPointerUp );
			el.addEventListener( 'lostpointercapture', onPointerUp );
		},
		[ containerSize, imageSize, dispatch ]
	);

	const onWheel = useCallback(
		( e: WheelEvent ) => {
			e.preventDefault();

			const s = stateRef.current;
			const delta = -e.deltaY * zoomSpeed;
			const newZoom = Math.min(
				maxZoom,
				Math.max( minZoom, s.zoom + delta )
			);

			if ( newZoom === s.zoom ) {
				return;
			}

			// Focal-point zoom: keep the point under the cursor stationary
			// on screen. Without this, zooming always scales from the image
			// center, which feels wrong when the cursor is at an edge.
			//
			// How it works:
			// 1. Get the cursor position relative to the container center
			//    (fx, fy) in screen pixels.
			// 2. Convert to visual-normalized space by dividing by visSize.
			//    This gives the cursor's position as the image "sees" it.
			// 3. When zoom changes from z1 to z2, every point on the image
			//    moves away from / toward the image center by the ratio
			//    z2/z1. The cursor point would drift by:
			//      drift = (focalNorm - pan) * (1 - z2/z1)
			//    where focalNorm is the focal point in normalized space
			//    and pan is the current image offset.
			// 4. We add this drift to the pan so the focal point stays put.
			// 5. restrictPanZoom clamps the result so the image still
			//    covers the crop — near edges the focal point can't be
			//    perfectly honored, which is the correct behavior.
			const visSize = imageSize ?? containerSize;
			const target = e.currentTarget;
			const rect =
				target instanceof Element
					? target.getBoundingClientRect()
					: undefined;
			if ( visSize.width > 0 && visSize.height > 0 && rect ) {
				// Step 1: cursor position relative to container center.
				const fx = e.clientX - rect.left - containerSize.width / 2;
				const fy = e.clientY - rect.top - containerSize.height / 2;

				// Step 2-4: compute the pan correction.
				// zoomRatio = (1 - newZoom/oldZoom) is the fraction of
				// the focal-to-center offset that becomes drift.
				const zoomRatio = 1 - newZoom / s.zoom;
				const focalNormX = fx / visSize.width;
				const focalNormY = fy / visSize.height;
				const newCropX =
					s.crop.x + ( focalNormX - s.crop.x ) * zoomRatio;
				const newCropY =
					s.crop.y + ( focalNormY - s.crop.y ) * zoomRatio;

				// Step 5: clamp pan so the image covers the crop.
				const { crop: clampedCrop } = restrictPanZoom(
					{ ...s, zoom: newZoom, crop: { x: newCropX, y: newCropY } },
					getImageSize( s ),
					s.cropRect
				);
				dispatch( {
					type: 'SET_ZOOM_AT_POINT',
					payload: { zoom: newZoom, crop: clampedCrop },
				} );
			} else {
				// Fallback: uniform zoom (no focal point available).
				dispatch( { type: 'SET_ZOOM', payload: newZoom } );
			}
		},
		[ dispatch, zoomSpeed, minZoom, maxZoom, containerSize, imageSize ]
	);

	const onTouchStart = useCallback(
		( e: React.TouchEvent ) => {
			const currentState = stateRef.current;

			if ( e.touches.length === 2 ) {
				// Two-finger pinch zoom.
				const distance = getTouchDistance(
					e.touches[ 0 ],
					e.touches[ 1 ]
				);
				touchRef.current = {
					startDistance: distance,
					startZoom: currentState.zoom,
					lastTouchX: 0,
					lastTouchY: 0,
					startCropX: currentState.crop.x,
					startCropY: currentState.crop.y,
					isSingleTouch: false,
					containerRect: e.currentTarget.getBoundingClientRect(),
				};
			} else if ( e.touches.length === 1 ) {
				// Double-tap detection: toggle between fit and 2x zoom.
				const now = Date.now();
				const tapX = e.touches[ 0 ].clientX;
				const tapY = e.touches[ 0 ].clientY;
				const lastTap = lastTapRef.current;

				if ( lastTap ) {
					const timeDelta = now - lastTap.time;
					const distDelta = Math.sqrt(
						( tapX - lastTap.x ) ** 2 + ( tapY - lastTap.y ) ** 2
					);

					if (
						timeDelta < DOUBLE_TAP_TIME &&
						distDelta < DOUBLE_TAP_DISTANCE
					) {
						// It's a double-tap — suppress browser zoom.
						e.preventDefault();
						lastTapRef.current = null;

						// Toggle: if past halfway to doubleTapZoom, go back to 1x.
						const targetZoom =
							currentState.zoom > ( minZoom + doubleTapZoom ) / 2
								? minZoom
								: doubleTapZoom;
						const visSize = imageSize ?? containerSize;
						const rect = e.currentTarget.getBoundingClientRect();

						// Enable zoom animation before dispatching.
						setIsZooming( true );
						clearTimeout( zoomTimerRef.current );
						zoomTimerRef.current = setTimeout( () => {
							setIsZooming( false );
						}, ZOOM_ANIMATION_DURATION );

						if ( visSize.width > 0 && visSize.height > 0 ) {
							const fx =
								tapX - rect.left - containerSize.width / 2;
							const fy =
								tapY - rect.top - containerSize.height / 2;

							const zoomRatio =
								1 - targetZoom / currentState.zoom;
							const focalNormX = fx / visSize.width;
							const focalNormY = fy / visSize.height;
							const newCropX =
								currentState.crop.x +
								( focalNormX - currentState.crop.x ) *
									zoomRatio;
							const newCropY =
								currentState.crop.y +
								( focalNormY - currentState.crop.y ) *
									zoomRatio;

							const { crop: clampedCrop } = restrictPanZoom(
								{
									...currentState,
									zoom: targetZoom,
									crop: {
										x: newCropX,
										y: newCropY,
									},
								},
								getImageSize( currentState ),
								currentState.cropRect
							);
							dispatch( {
								type: 'SET_ZOOM_AT_POINT',
								payload: {
									zoom: targetZoom,
									crop: clampedCrop,
								},
							} );
						} else {
							dispatch( {
								type: 'SET_ZOOM',
								payload: targetZoom,
							} );
						}
						return;
					}
				}

				// Record this tap for future double-tap detection.
				lastTapRef.current = { time: now, x: tapX, y: tapY };

				// Single finger pan.
				touchRef.current = {
					startDistance: 0,
					startZoom: currentState.zoom,
					lastTouchX: e.touches[ 0 ].clientX,
					lastTouchY: e.touches[ 0 ].clientY,
					startCropX: currentState.crop.x,
					startCropY: currentState.crop.y,
					isSingleTouch: true,
				};
			}

			const onTouchMove = ( moveEvent: TouchEvent ) => {
				const touch = touchRef.current;
				if ( ! touch ) {
					return;
				}

				cancelAnimationFrame( rafRef.current );
				rafRef.current = requestAnimationFrame( () => {
					const s = stateRef.current;

					if (
						! touch.isSingleTouch &&
						moveEvent.touches.length === 2
					) {
						// Pinch zoom with focal point at finger midpoint.
						// Same algorithm as mouse wheel zoom (see comments
						// there) but uses the midpoint between the two
						// touch points as the focal point instead of the
						// cursor position.
						const t0 = moveEvent
							.touches[ 0 ] as unknown as React.Touch;
						const t1 = moveEvent
							.touches[ 1 ] as unknown as React.Touch;
						const currentDistance = getTouchDistance( t0, t1 );
						const ratio = currentDistance / touch.startDistance;
						const newZoom = Math.min(
							maxZoom,
							Math.max( minZoom, touch.startZoom * ratio )
						);

						const visSize = imageSize ?? containerSize;
						const rect = touch.containerRect;
						if (
							visSize.width > 0 &&
							visSize.height > 0 &&
							rect &&
							newZoom !== s.zoom
						) {
							// Focal point: midpoint of two fingers,
							// relative to container center.
							const mx =
								( t0.clientX + t1.clientX ) / 2 -
								rect.left -
								containerSize.width / 2;
							const my =
								( t0.clientY + t1.clientY ) / 2 -
								rect.top -
								containerSize.height / 2;

							// Same drift correction as mouse wheel.
							const zoomRatio = 1 - newZoom / s.zoom;
							const focalNormX = mx / visSize.width;
							const focalNormY = my / visSize.height;
							const newCropX =
								s.crop.x +
								( focalNormX - s.crop.x ) * zoomRatio;
							const newCropY =
								s.crop.y +
								( focalNormY - s.crop.y ) * zoomRatio;

							// Clamp so image covers the crop.
							const { crop: clampedCrop } = restrictPanZoom(
								{
									...s,
									zoom: newZoom,
									crop: {
										x: newCropX,
										y: newCropY,
									},
								},
								getImageSize( s ),
								s.cropRect
							);
							dispatch( {
								type: 'SET_CROP',
								payload: clampedCrop,
							} );
						}
						dispatch( {
							type: 'SET_ZOOM',
							payload: newZoom,
						} );
					} else if (
						touch.isSingleTouch &&
						moveEvent.touches.length === 1
					) {
						// Single finger pan in visual space.
						const panSize = imageSize ?? containerSize;
						const deltaX =
							panSize.width > 0
								? ( moveEvent.touches[ 0 ].clientX -
										touch.lastTouchX ) /
								  panSize.width
								: 0;
						const deltaY =
							panSize.height > 0
								? ( moveEvent.touches[ 0 ].clientY -
										touch.lastTouchY ) /
								  panSize.height
								: 0;

						const { crop: newCrop } = restrictPanZoom(
							{
								...s,
								crop: {
									x: touch.startCropX + deltaX,
									y: touch.startCropY + deltaY,
								},
							},
							getImageSize( s ),
							s.cropRect
						);

						dispatch( {
							type: 'SET_CROP',
							payload: newCrop,
						} );
					}
				} );
			};

			const onTouchEnd = () => {
				touchRef.current = null;
				touchCleanupRef.current = null;
				cancelAnimationFrame( rafRef.current );
				document.removeEventListener( 'touchmove', onTouchMove );
				document.removeEventListener( 'touchend', onTouchEnd );
				document.removeEventListener( 'touchcancel', onTouchEnd );
			};

			// Clean up any previous touch listeners before registering new ones.
			touchCleanupRef.current?.();

			document.addEventListener( 'touchmove', onTouchMove, {
				passive: false,
			} );
			document.addEventListener( 'touchend', onTouchEnd );
			document.addEventListener( 'touchcancel', onTouchEnd );

			touchCleanupRef.current = onTouchEnd;
		},
		[ containerSize, imageSize, dispatch, minZoom, maxZoom ]
	);

	const onKeyDown = useCallback(
		( e: React.KeyboardEvent ) => {
			const currentState = stateRef.current;

			switch ( e.key ) {
				case 'ArrowUp': {
					e.preventDefault();
					const { crop: newCrop } = restrictPanZoom(
						{
							...currentState,
							crop: {
								x: currentState.crop.x,
								y: currentState.crop.y - keyboardStep,
							},
						},
						getImageSize( currentState ),
						currentState.cropRect
					);
					dispatch( { type: 'SET_CROP', payload: newCrop } );
					break;
				}
				case 'ArrowDown': {
					e.preventDefault();
					const { crop: newCrop } = restrictPanZoom(
						{
							...currentState,
							crop: {
								x: currentState.crop.x,
								y: currentState.crop.y + keyboardStep,
							},
						},
						getImageSize( currentState ),
						currentState.cropRect
					);
					dispatch( { type: 'SET_CROP', payload: newCrop } );
					break;
				}
				case 'ArrowLeft': {
					e.preventDefault();
					const { crop: newCrop } = restrictPanZoom(
						{
							...currentState,
							crop: {
								x: currentState.crop.x - keyboardStep,
								y: currentState.crop.y,
							},
						},
						getImageSize( currentState ),
						currentState.cropRect
					);
					dispatch( { type: 'SET_CROP', payload: newCrop } );
					break;
				}
				case 'ArrowRight': {
					e.preventDefault();
					const { crop: newCrop } = restrictPanZoom(
						{
							...currentState,
							crop: {
								x: currentState.crop.x + keyboardStep,
								y: currentState.crop.y,
							},
						},
						getImageSize( currentState ),
						currentState.cropRect
					);
					dispatch( { type: 'SET_CROP', payload: newCrop } );
					break;
				}
				case '+':
				case '=': {
					e.preventDefault();
					const newZoom = Math.min(
						maxZoom,
						Math.max( minZoom, currentState.zoom + 0.5 )
					);
					dispatch( { type: 'SET_ZOOM', payload: newZoom } );
					break;
				}
				case '-':
				case '_': {
					e.preventDefault();
					const newZoom = Math.min(
						maxZoom,
						Math.max( minZoom, currentState.zoom - 0.5 )
					);
					dispatch( { type: 'SET_ZOOM', payload: newZoom } );
					break;
				}
				case 'r':
				case 'R': {
					e.preventDefault();
					dispatch( {
						type: 'SNAP_ROTATE_90',
						payload: { direction: 1 },
					} );
					break;
				}
			}
		},
		[ dispatch, keyboardStep, minZoom, maxZoom ]
	);

	return {
		handlers: {
			onPointerDown,
			onTouchStart,
			onKeyDown,
		},
		onWheelNative: onWheel,
		isDragging,
		isZooming,
	};
}
