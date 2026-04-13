/**
 * Internal dependencies
 */
import type { CropperAction, CropperState, Size } from './types';
import { MIN_ZOOM, MAX_ZOOM } from './constants';
import { restrictPanZoom } from './camera';

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
function getImageSizeFromState( state: CropperState ): {
	width: number;
	height: number;
} {
	return state.image
		? { width: state.image.naturalWidth, height: state.image.naturalHeight }
		: { width: 1, height: 1 };
}

/**
 * Get the distance between two touch points.
 *
 * @param t1 The first touch.
 * @param t2 The second touch.
 * @return The pixel distance between the two touches.
 */
function getTouchDistance( t1: Touch, t2: Touch ): number {
	const dx = t1.clientX - t2.clientX;
	const dy = t1.clientY - t2.clientY;
	return Math.sqrt( dx * dx + dy * dy );
}

/**
 * Status reported by the interaction controller when drag/zoom state changes.
 */
export interface InteractionStatus {
	/** Whether a drag (pan) interaction is in progress. */
	isDragging: boolean;
	/** Whether a double-tap zoom animation is in progress. */
	isZooming: boolean;
}

/**
 * Options for creating an InteractionController.
 *
 * Scalar options (minZoom, maxZoom, etc.) are read lazily on each
 * interaction, so changes to the options object take effect immediately
 * without recreating the controller.
 */
export interface InteractionControllerOptions {
	/** Returns the current cropper state. Called on every interaction. */
	getState: () => CropperState;
	/** Dispatches a cropper action. */
	dispatch: ( action: CropperAction ) => void;
	/** Returns the container dimensions in pixels. */
	getContainerSize: () => Size;
	/** Returns the rendered image dimensions in pixels, if available. */
	getImageSize: () => Size | undefined;
	/** Minimum zoom level. Defaults to MIN_ZOOM. Read lazily. */
	minZoom?: number;
	/** Maximum zoom level. Defaults to MAX_ZOOM. Read lazily. */
	maxZoom?: number;
	/** Zoom speed multiplier for wheel events. Defaults to 0.01. Read lazily. */
	zoomSpeed?: number;
	/** Pan step size in normalized coords for keyboard events. Defaults to 0.05. Read lazily. */
	keyboardStep?: number;
	/** Zoom level for double-tap zoom. Defaults to 2. Read lazily. */
	doubleTapZoom?: number;
	/** Fires when a continuous gesture begins (pan drag, pinch zoom). */
	onGestureStart?: () => void;
	/** Fires when a continuous gesture ends (pointer release). */
	onGestureEnd?: () => void;
	/** Called when isDragging or isZooming changes. */
	onStatusChange?: ( status: InteractionStatus ) => void;
}

/**
 * Framework-agnostic imperative controller for image cropper interactions.
 *
 * Handles mouse, touch, and keyboard event processing for pan, zoom,
 * and crop manipulation. Uses requestAnimationFrame for drag/pinch
 * updates to avoid layout thrashing.
 *
 * The controller does not register DOM event listeners itself — that is the
 * responsibility of the UI layer (React hook, Vue directive, or vanilla JS).
 * Instead it exposes `handlePointerDown`, `handleWheel`, `handleTouchStart`,
 * and `handleKeyDown` methods that the UI layer calls with native DOM events.
 *
 * Scalar options (minZoom, maxZoom, zoomSpeed, keyboardStep, doubleTapZoom)
 * are read lazily from `this.options` on each interaction, so the UI layer
 * can update them without recreating the controller.
 *
 * Call `destroy()` to clean up timers and pending animation frames.
 */
export class InteractionController {
	private readonly options: InteractionControllerOptions;

	/** Current drag/zoom status. */
	private isDragging = false;
	private isZooming = false;

	/** Active drag state during pointer interactions. */
	private drag: {
		startX: number;
		startY: number;
		startCropX: number;
		startCropY: number;
	} | null = null;

	/** Active touch state during touch interactions. */
	private touch: {
		startDistance: number;
		startZoom: number;
		lastTouchX: number;
		lastTouchY: number;
		startCropX: number;
		startCropY: number;
		isSingleTouch: boolean;
		containerRect?: DOMRect;
	} | null = null;

	/** Cleanup function for active touch listeners on document. */
	private touchCleanup: ( () => void ) | null = null;

	/** Last tap info for double-tap detection. */
	private lastTap: {
		time: number;
		x: number;
		y: number;
	} | null = null;

	/** Timer for the zoom animation state (double-tap). */
	private zoomTimer: ReturnType< typeof setTimeout > | undefined;

	/** Timer for wheel gesture debounce. */
	private wheelGestureTimer: ReturnType< typeof setTimeout > | undefined;

	/** Whether a wheel gesture is currently active. */
	private wheelGestureActive = false;

	/** Current requestAnimationFrame ID. */
	private rafId = 0;

	constructor( options: InteractionControllerOptions ) {
		this.options = options;
	}

	/** Read minZoom lazily so option changes take effect immediately. */
	private get minZoom(): number {
		return this.options.minZoom ?? MIN_ZOOM;
	}

	/** Read maxZoom lazily so option changes take effect immediately. */
	private get maxZoom(): number {
		return this.options.maxZoom ?? MAX_ZOOM;
	}

	/** Read zoomSpeed lazily so option changes take effect immediately. */
	private get zoomSpeed(): number {
		return this.options.zoomSpeed ?? 0.01;
	}

	/** Read keyboardStep lazily so option changes take effect immediately. */
	private get keyboardStep(): number {
		return this.options.keyboardStep ?? 0.05;
	}

	/** Read doubleTapZoom lazily so option changes take effect immediately. */
	private get doubleTapZoom(): number {
		return this.options.doubleTapZoom ?? 2;
	}

	/**
	 * Update the drag/zoom status and notify via callback if changed.
	 *
	 * @param update Partial status with isDragging and/or isZooming.
	 */
	private setStatus(
		update: Partial< { isDragging: boolean; isZooming: boolean } >
	): void {
		let changed = false;
		if (
			update.isDragging !== undefined &&
			update.isDragging !== this.isDragging
		) {
			this.isDragging = update.isDragging;
			changed = true;
		}
		if (
			update.isZooming !== undefined &&
			update.isZooming !== this.isZooming
		) {
			this.isZooming = update.isZooming;
			changed = true;
		}
		if ( changed ) {
			this.options.onStatusChange?.( {
				isDragging: this.isDragging,
				isZooming: this.isZooming,
			} );
		}
	}

	/**
	 * Handle a pointer-down event on the container element.
	 *
	 * Initiates a drag (pan) interaction. Captures the pointer on the
	 * provided element and registers pointermove/pointerup/lostpointercapture
	 * listeners for the duration of the drag.
	 *
	 * @param e  The native PointerEvent.
	 * @param el The DOM element to capture the pointer on.
	 */
	handlePointerDown( e: PointerEvent, el: HTMLElement ): void {
		// Only handle primary button (left click / first touch).
		if ( e.button !== 0 ) {
			return;
		}
		e.preventDefault();

		// Blur any focused handle so its focus ring doesn't linger.
		const ownerDoc = el.ownerDocument;
		if ( ownerDoc?.activeElement instanceof HTMLElement ) {
			ownerDoc.activeElement.blur();
		}

		// Capture pointer so drag works across iframe boundaries.
		el.setPointerCapture( e.pointerId );

		this.setStatus( { isDragging: true } );
		this.options.onGestureStart?.();

		const currentState = this.options.getState();
		this.drag = {
			startX: e.clientX,
			startY: e.clientY,
			startCropX: currentState.crop.x,
			startCropY: currentState.crop.y,
		};

		const onPointerMove = ( moveEvent: Event ) => {
			const drag = this.drag;
			if ( ! drag ) {
				return;
			}
			const pe = moveEvent as PointerEvent;

			cancelAnimationFrame( this.rafId );
			this.rafId = requestAnimationFrame( () => {
				const s = this.options.getState();
				const imgSize = this.options.getImageSize();
				const containerSize = this.options.getContainerSize();
				const panSize = imgSize ?? containerSize;
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
					getImageSizeFromState( s ),
					s.cropRect
				);

				this.options.dispatch( {
					type: 'SET_CROP',
					payload: newCrop,
				} );
			} );
		};

		const onPointerUp = () => {
			this.setStatus( { isDragging: false } );
			this.options.onGestureEnd?.();
			this.drag = null;
			cancelAnimationFrame( this.rafId );
			el.removeEventListener( 'pointermove', onPointerMove );
			el.removeEventListener( 'pointerup', onPointerUp );
			el.removeEventListener( 'lostpointercapture', onPointerUp );
		};

		el.addEventListener( 'pointermove', onPointerMove );
		el.addEventListener( 'pointerup', onPointerUp );
		el.addEventListener( 'lostpointercapture', onPointerUp );
	}

	/**
	 * Handle a wheel event on the container element.
	 *
	 * Implements focal-point zoom: the point under the cursor stays
	 * stationary on screen while the zoom level changes.
	 *
	 * Must be registered with `{ passive: false }` to allow preventDefault.
	 *
	 * @param e The native WheelEvent.
	 */
	handleWheel( e: WheelEvent ): void {
		e.preventDefault();

		// Debounced gesture boundaries for wheel zoom.
		// Start on first wheel event, end after 300ms of no events.
		if ( ! this.wheelGestureActive ) {
			this.wheelGestureActive = true;
			this.options.onGestureStart?.();
		}
		clearTimeout( this.wheelGestureTimer );
		this.wheelGestureTimer = setTimeout( () => {
			this.wheelGestureActive = false;
			this.options.onGestureEnd?.();
		}, DOUBLE_TAP_TIME );

		const s = this.options.getState();
		const delta = -e.deltaY * this.zoomSpeed;
		const newZoom = Math.min(
			this.maxZoom,
			Math.max( this.minZoom, s.zoom + delta )
		);

		if ( newZoom === s.zoom ) {
			return;
		}

		// Focal-point zoom: keep the point under the cursor stationary.
		const containerSize = this.options.getContainerSize();
		const imgSize = this.options.getImageSize();
		const visSize = imgSize ?? containerSize;
		const target = e.currentTarget;
		const rect =
			target instanceof Element
				? target.getBoundingClientRect()
				: undefined;
		if ( visSize.width > 0 && visSize.height > 0 && rect ) {
			const fx = e.clientX - rect.left - containerSize.width / 2;
			const fy = e.clientY - rect.top - containerSize.height / 2;

			const zoomRatio = 1 - newZoom / s.zoom;
			const focalNormX = fx / visSize.width;
			const focalNormY = fy / visSize.height;
			const newCropX = s.crop.x + ( focalNormX - s.crop.x ) * zoomRatio;
			const newCropY = s.crop.y + ( focalNormY - s.crop.y ) * zoomRatio;

			const { crop: clampedCrop } = restrictPanZoom(
				{ ...s, zoom: newZoom, crop: { x: newCropX, y: newCropY } },
				getImageSizeFromState( s ),
				s.cropRect
			);
			this.options.dispatch( {
				type: 'SET_ZOOM_AT_POINT',
				payload: { zoom: newZoom, crop: clampedCrop },
			} );
		} else {
			this.options.dispatch( { type: 'SET_ZOOM', payload: newZoom } );
		}
	}

	/**
	 * Handle a touch-start event on the container element.
	 *
	 * Supports single-finger pan, two-finger pinch zoom, and
	 * double-tap to toggle between fit and 2x zoom. Registers
	 * touchmove/touchend/touchcancel on the provided document for the
	 * duration of the gesture.
	 *
	 * @param e             The native TouchEvent.
	 * @param containerRect The bounding rect of the container element.
	 * @param doc           The document to register move/end listeners on.
	 *                      Defaults to globalThis.document. Pass the iframe's
	 *                      contentDocument when running inside an iframe.
	 */
	handleTouchStart(
		e: TouchEvent,
		containerRect: DOMRect,
		doc: Document = document
	): void {
		const currentState = this.options.getState();
		const containerSize = this.options.getContainerSize();
		const imgSize = this.options.getImageSize();

		if ( e.touches.length === 2 ) {
			// Two-finger pinch zoom.
			const distance = getTouchDistance( e.touches[ 0 ], e.touches[ 1 ] );
			this.touch = {
				startDistance: distance,
				startZoom: currentState.zoom,
				lastTouchX: 0,
				lastTouchY: 0,
				startCropX: currentState.crop.x,
				startCropY: currentState.crop.y,
				isSingleTouch: false,
				containerRect,
			};
			this.options.onGestureStart?.();
		} else if ( e.touches.length === 1 ) {
			// Double-tap detection: toggle between fit and 2x zoom.
			const now = Date.now();
			const tapX = e.touches[ 0 ].clientX;
			const tapY = e.touches[ 0 ].clientY;
			const lastTap = this.lastTap;

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
					this.lastTap = null;

					// Toggle: if past halfway to doubleTapZoom, go back to 1x.
					const targetZoom =
						currentState.zoom >
						( this.minZoom + this.doubleTapZoom ) / 2
							? this.minZoom
							: this.doubleTapZoom;
					const visSize = imgSize ?? containerSize;

					// Enable zoom animation before dispatching.
					this.setStatus( { isZooming: true } );
					clearTimeout( this.zoomTimer );
					this.zoomTimer = setTimeout( () => {
						this.setStatus( { isZooming: false } );
					}, ZOOM_ANIMATION_DURATION );

					if ( visSize.width > 0 && visSize.height > 0 ) {
						const fx =
							tapX - containerRect.left - containerSize.width / 2;
						const fy =
							tapY - containerRect.top - containerSize.height / 2;

						const zoomRatio = 1 - targetZoom / currentState.zoom;
						const focalNormX = fx / visSize.width;
						const focalNormY = fy / visSize.height;
						const newCropX =
							currentState.crop.x +
							( focalNormX - currentState.crop.x ) * zoomRatio;
						const newCropY =
							currentState.crop.y +
							( focalNormY - currentState.crop.y ) * zoomRatio;

						const { crop: clampedCrop } = restrictPanZoom(
							{
								...currentState,
								zoom: targetZoom,
								crop: {
									x: newCropX,
									y: newCropY,
								},
							},
							getImageSizeFromState( currentState ),
							currentState.cropRect
						);
						this.options.dispatch( {
							type: 'SET_ZOOM_AT_POINT',
							payload: {
								zoom: targetZoom,
								crop: clampedCrop,
							},
						} );
					} else {
						this.options.dispatch( {
							type: 'SET_ZOOM',
							payload: targetZoom,
						} );
					}
					return;
				}
			}

			// Record this tap for future double-tap detection.
			this.lastTap = { time: now, x: tapX, y: tapY };

			// Single finger pan.
			this.touch = {
				startDistance: 0,
				startZoom: currentState.zoom,
				lastTouchX: e.touches[ 0 ].clientX,
				lastTouchY: e.touches[ 0 ].clientY,
				startCropX: currentState.crop.x,
				startCropY: currentState.crop.y,
				isSingleTouch: true,
			};
			this.setStatus( { isDragging: true } );
			this.options.onGestureStart?.();
		}

		const onTouchMove = ( moveEvent: TouchEvent ) => {
			const touch = this.touch;
			if ( ! touch ) {
				return;
			}

			cancelAnimationFrame( this.rafId );
			this.rafId = requestAnimationFrame( () => {
				const s = this.options.getState();
				const latestContainerSize = this.options.getContainerSize();
				const latestImageSize = this.options.getImageSize();

				if ( ! touch.isSingleTouch && moveEvent.touches.length === 2 ) {
					// Pinch zoom with focal point at finger midpoint.
					const t0 = moveEvent.touches[ 0 ];
					const t1 = moveEvent.touches[ 1 ];
					const currentDistance = getTouchDistance( t0, t1 );
					const ratio = currentDistance / touch.startDistance;
					const newZoom = Math.min(
						this.maxZoom,
						Math.max( this.minZoom, touch.startZoom * ratio )
					);

					const visSize = latestImageSize ?? latestContainerSize;
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
							latestContainerSize.width / 2;
						const my =
							( t0.clientY + t1.clientY ) / 2 -
							rect.top -
							latestContainerSize.height / 2;

						const zoomRatio = 1 - newZoom / s.zoom;
						const focalNormX = mx / visSize.width;
						const focalNormY = my / visSize.height;
						const newCropX =
							s.crop.x + ( focalNormX - s.crop.x ) * zoomRatio;
						const newCropY =
							s.crop.y + ( focalNormY - s.crop.y ) * zoomRatio;

						const { crop: clampedCrop } = restrictPanZoom(
							{
								...s,
								zoom: newZoom,
								crop: { x: newCropX, y: newCropY },
							},
							getImageSizeFromState( s ),
							s.cropRect
						);
						// Atomic zoom+pan dispatch — same as wheel zoom.
						this.options.dispatch( {
							type: 'SET_ZOOM_AT_POINT',
							payload: { zoom: newZoom, crop: clampedCrop },
						} );
					} else {
						this.options.dispatch( {
							type: 'SET_ZOOM',
							payload: newZoom,
						} );
					}
				} else if (
					touch.isSingleTouch &&
					moveEvent.touches.length === 1
				) {
					// Single finger pan in visual space.
					const panSize = latestImageSize ?? latestContainerSize;
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
						getImageSizeFromState( s ),
						s.cropRect
					);

					this.options.dispatch( {
						type: 'SET_CROP',
						payload: newCrop,
					} );
				}
			} );
		};

		const onTouchEnd = () => {
			const wasSingleTouch = this.touch?.isSingleTouch;
			this.touch = null;
			this.touchCleanup = null;
			cancelAnimationFrame( this.rafId );
			doc.removeEventListener( 'touchmove', onTouchMove );
			doc.removeEventListener( 'touchend', onTouchEnd );
			doc.removeEventListener( 'touchcancel', onTouchEnd );
			if ( wasSingleTouch ) {
				this.setStatus( { isDragging: false } );
			}
			this.options.onGestureEnd?.();
		};

		// Clean up any previous touch listeners before registering new ones.
		this.touchCleanup?.();

		doc.addEventListener( 'touchmove', onTouchMove, {
			passive: false,
		} );
		doc.addEventListener( 'touchend', onTouchEnd );
		doc.addEventListener( 'touchcancel', onTouchEnd );
	}

	/**
	 * Handle a keydown event on the container element.
	 *
	 * Supports arrow keys for panning, +/- for zoom, and r/R for rotation.
	 *
	 * @param e The native KeyboardEvent.
	 */
	handleKeyDown( e: KeyboardEvent ): void {
		const currentState = this.options.getState();

		switch ( e.key ) {
			case 'ArrowUp': {
				e.preventDefault();
				const { crop: newCrop } = restrictPanZoom(
					{
						...currentState,
						crop: {
							x: currentState.crop.x,
							y: currentState.crop.y - this.keyboardStep,
						},
					},
					getImageSizeFromState( currentState ),
					currentState.cropRect
				);
				this.options.dispatch( {
					type: 'SET_CROP',
					payload: newCrop,
				} );
				break;
			}
			case 'ArrowDown': {
				e.preventDefault();
				const { crop: newCrop } = restrictPanZoom(
					{
						...currentState,
						crop: {
							x: currentState.crop.x,
							y: currentState.crop.y + this.keyboardStep,
						},
					},
					getImageSizeFromState( currentState ),
					currentState.cropRect
				);
				this.options.dispatch( {
					type: 'SET_CROP',
					payload: newCrop,
				} );
				break;
			}
			case 'ArrowLeft': {
				e.preventDefault();
				const { crop: newCrop } = restrictPanZoom(
					{
						...currentState,
						crop: {
							x: currentState.crop.x - this.keyboardStep,
							y: currentState.crop.y,
						},
					},
					getImageSizeFromState( currentState ),
					currentState.cropRect
				);
				this.options.dispatch( {
					type: 'SET_CROP',
					payload: newCrop,
				} );
				break;
			}
			case 'ArrowRight': {
				e.preventDefault();
				const { crop: newCrop } = restrictPanZoom(
					{
						...currentState,
						crop: {
							x: currentState.crop.x + this.keyboardStep,
							y: currentState.crop.y,
						},
					},
					getImageSizeFromState( currentState ),
					currentState.cropRect
				);
				this.options.dispatch( {
					type: 'SET_CROP',
					payload: newCrop,
				} );
				break;
			}
			case '+':
			case '=': {
				e.preventDefault();
				const newZoom = Math.min(
					this.maxZoom,
					Math.max( this.minZoom, currentState.zoom + 0.5 )
				);
				this.options.dispatch( {
					type: 'SET_ZOOM',
					payload: newZoom,
				} );
				break;
			}
			case '-':
			case '_': {
				e.preventDefault();
				const newZoom = Math.min(
					this.maxZoom,
					Math.max( this.minZoom, currentState.zoom - 0.5 )
				);
				this.options.dispatch( {
					type: 'SET_ZOOM',
					payload: newZoom,
				} );
				break;
			}
			case 'r':
			case 'R': {
				e.preventDefault();
				this.options.dispatch( {
					type: 'SNAP_ROTATE_90',
					payload: { direction: 1 },
				} );
				break;
			}
		}
	}

	/**
	 * Clean up all timers, animation frames, and active touch listeners.
	 *
	 * Must be called when the controller is no longer needed (e.g., on
	 * component unmount or element removal).
	 */
	destroy(): void {
		cancelAnimationFrame( this.rafId );
		clearTimeout( this.zoomTimer );
		clearTimeout( this.wheelGestureTimer );
		this.touchCleanup?.();
		this.drag = null;
		this.touch = null;
		this.lastTap = null;
	}
}
