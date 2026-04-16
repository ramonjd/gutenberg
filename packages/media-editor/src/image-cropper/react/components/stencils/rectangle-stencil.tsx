/**
 * WordPress dependencies
 */
import {
	useState,
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from '@wordpress/element';
import { __ } from '@wordpress/i18n';

/**
 * Internal dependencies
 */
import type { StencilProps, NormalizedRect } from '../../../core/types';
import {
	computeFreeResizeRect,
	computeLockedResizeRect,
	type HandlePosition,
	type CropBounds,
	type ResizeDragState,
} from '../../../core/stencil-math';

/**
 * Corner handle positions only — used when aspect ratio is locked.
 */
const CORNER_POSITIONS: HandlePosition[] = [ 'nw', 'ne', 'sw', 'se' ];

/**
 * All handle positions rendered by the stencil.
 */
const ALL_POSITIONS: HandlePosition[] = [
	'n',
	's',
	'e',
	'w',
	'nw',
	'ne',
	'sw',
	'se',
];

/**
 * Get the translated aria-label for a resize handle position.
 *
 * @param pos The handle position identifier.
 * @return The translated label string.
 */
function getHandleLabel( pos: HandlePosition ): string {
	switch ( pos ) {
		case 'n':
			return __( 'Resize top edge' );
		case 's':
			return __( 'Resize bottom edge' );
		case 'e':
			return __( 'Resize right edge' );
		case 'w':
			return __( 'Resize left edge' );
		case 'nw':
			return __( 'Resize top-left corner' );
		case 'ne':
			return __( 'Resize top-right corner' );
		case 'sw':
			return __( 'Resize bottom-left corner' );
		case 'se':
			return __( 'Resize bottom-right corner' );
	}
}

/**
 * Step size for keyboard-driven handle resize, in normalized coordinates.
 */
const KEYBOARD_STEP = 0.02;

/** Delay before keyboard resize triggers settle (ms). */
const KEYBOARD_SETTLE_DELAY = 500;

/**
 * Props for the RectangleStencil component.
 */
type RectangleStencilProps = StencilProps;

/**
 * A rectangular crop stencil with resize handles.
 *
 * In freeform mode, handles resize the crop area. Clicks inside the
 * crop pass through to the container for image panning. The crop
 * auto-centers after resize via SETTLE_CROP.
 *
 * @param props                   Component props implementing StencilProps.
 * @param props.cropRect          The crop rectangle in normalized coordinates.
 * @param props.containerSize     The container element dimensions in pixels.
 * @param props.imageSize         The rendered image dimensions in pixels.
 * @param props.onCropChange      Callback fired when the crop rect changes.
 * @param props.onResizeStart     Callback fired when a resize drag starts.
 * @param props.onResizeEnd       Callback fired when a resize drag ends (mouseup).
 * @param props.aspectRatio       Optional fixed aspect ratio (width / height).
 * @param props.freeformCrop      Whether resize handles are shown.
 * @param props.stencilTransition CSS transition string for settle animation.
 * @param props.cropBounds        Maximum crop rect bounds from camera (zoom/rotation-aware).
 * @return The rectangle stencil element.
 */
export function RectangleStencil( {
	cropRect,
	containerSize,
	imageSize,
	onCropChange,
	onResizeStart,
	onResizeEnd,
	aspectRatio,
	freeformCrop = false,
	stencilTransition,
	cropBounds,
}: RectangleStencilProps ) {
	// Use cropBounds from the camera if available, otherwise default to [0,1].
	const boundsMinX = cropBounds?.minX ?? 0;
	const boundsMinY = cropBounds?.minY ?? 0;
	const boundsMaxX = cropBounds?.maxX ?? 1;
	const boundsMaxY = cropBounds?.maxY ?? 1;
	const bounds: CropBounds = useMemo(
		() => ( {
			minX: boundsMinX,
			minY: boundsMinY,
			maxX: boundsMaxX,
			maxY: boundsMaxY,
		} ),
		[ boundsMinX, boundsMinY, boundsMaxX, boundsMaxY ]
	);
	const keyboardSettleTimerRef = useRef< ReturnType< typeof setTimeout > >();
	const dragElementRef = useRef< Element | null >( null );
	const [ dragState, setDragState ] = useState< ResizeDragState | null >(
		null
	);
	const hasLockedRatio = !! ( aspectRatio && aspectRatio > 0 );

	// The normalized aspect ratio: the w/h ratio in normalized space that
	// produces the desired pixel aspect ratio.
	// pixelW = w * imageSize.width, pixelH = h * imageSize.height
	// pixelW / pixelH = aspectRatio  =>  w / h = aspectRatio * imageSize.height / imageSize.width
	const normalizedRatio = useMemo( () => {
		if ( ! hasLockedRatio || imageSize.width === 0 ) {
			return 0;
		}
		return ( aspectRatio * imageSize.height ) / imageSize.width;
	}, [ aspectRatio, hasLockedRatio, imageSize.width, imageSize.height ] );

	// Convert normalized crop rect to pixel bounds, accounting for the
	// image offset within the container.
	const offsetX = ( containerSize.width - imageSize.width ) / 2;
	const offsetY = ( containerSize.height - imageSize.height ) / 2;
	const left = offsetX + cropRect.x * imageSize.width;
	const top = offsetY + cropRect.y * imageSize.height;
	const width = cropRect.width * imageSize.width;
	const height = cropRect.height * imageSize.height;

	/**
	 * Start a resize drag on a handle (pointer — works across iframes).
	 */
	const handlePointerDown = useCallback(
		( handle: HandlePosition, event: React.PointerEvent ) => {
			if ( event.button !== 0 ) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			// Blur any previously focused handle.
			const ownerDoc = event.currentTarget.ownerDocument;
			if ( ownerDoc.activeElement instanceof HTMLElement ) {
				ownerDoc.activeElement.blur();
			}
			// Capture pointer so drag works across iframe boundaries.
			const el = event.currentTarget;
			el.setPointerCapture( event.pointerId );
			dragElementRef.current = el;
			onResizeStart?.();
			setDragState( {
				handle,
				startX: event.clientX,
				startY: event.clientY,
				startRect: { ...cropRect },
			} );
		},
		[ cropRect, onResizeStart ]
	);

	/**
	 * Compute the new crop rect for a free (no aspect ratio) resize.
	 * Delegates to the pure function in core/stencil-math.ts.
	 */
	const computeFreeRect = useCallback(
		(
			drag: ResizeDragState,
			clientX: number,
			clientY: number
		): NormalizedRect =>
			computeFreeResizeRect( drag, clientX, clientY, imageSize, bounds ),
		[ imageSize, bounds ]
	);

	/**
	 * Compute the new crop rect for a locked-aspect-ratio corner resize.
	 * Delegates to the pure function in core/stencil-math.ts.
	 */
	const computeLockedRect = useCallback(
		(
			drag: ResizeDragState,
			clientX: number,
			clientY: number
		): NormalizedRect =>
			computeLockedResizeRect(
				drag,
				clientX,
				clientY,
				imageSize,
				bounds,
				normalizedRatio
			),
		[ imageSize, bounds, normalizedRatio ]
	);

	/**
	 * Handle keyboard arrow keys on a resize handle.
	 * Moves the corresponding edge(s) by KEYBOARD_STEP in normalized space.
	 */
	const handleKeyDown = useCallback(
		( handle: HandlePosition, event: React.KeyboardEvent ) => {
			const key = event.key;
			if (
				key !== 'ArrowUp' &&
				key !== 'ArrowDown' &&
				key !== 'ArrowLeft' &&
				key !== 'ArrowRight'
			) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();

			// Determine the normalized delta from the arrow key.
			let dx = 0;
			let dy = 0;
			if ( key === 'ArrowLeft' ) {
				dx = -KEYBOARD_STEP;
			}
			if ( key === 'ArrowRight' ) {
				dx = KEYBOARD_STEP;
			}
			if ( key === 'ArrowUp' ) {
				dy = -KEYBOARD_STEP;
			}
			if ( key === 'ArrowDown' ) {
				dy = KEYBOARD_STEP;
			}

			if ( hasLockedRatio ) {
				// For locked aspect ratio, synthesize a drag from the
				// current rect and apply the delta via computeLockedRect.
				const syntheticDrag: ResizeDragState = {
					handle,
					startX: 0,
					startY: 0,
					startRect: { ...cropRect },
				};
				const clientX = dx * imageSize.width;
				const clientY = dy * imageSize.height;
				onCropChange(
					computeLockedRect( syntheticDrag, clientX, clientY )
				);
				clearTimeout( keyboardSettleTimerRef.current );
				keyboardSettleTimerRef.current = setTimeout( () => {
					onResizeEnd?.();
				}, KEYBOARD_SETTLE_DELAY );
			} else {
				// For freeform resize, synthesize a drag via computeFreeRect.
				const syntheticDrag: ResizeDragState = {
					handle,
					startX: 0,
					startY: 0,
					startRect: { ...cropRect },
				};
				const clientX = dx * imageSize.width;
				const clientY = dy * imageSize.height;
				onCropChange(
					computeFreeRect( syntheticDrag, clientX, clientY )
				);
				clearTimeout( keyboardSettleTimerRef.current );
				keyboardSettleTimerRef.current = setTimeout( () => {
					onResizeEnd?.();
				}, KEYBOARD_SETTLE_DELAY );
			}
		},
		[
			cropRect,
			hasLockedRatio,
			imageSize.width,
			imageSize.height,
			computeLockedRect,
			computeFreeRect,
			onCropChange,
			onResizeEnd,
		]
	);

	// Handle resize drag events.
	useEffect( () => {
		if ( ! dragState ) {
			return;
		}

		const handleMouseMove = ( event: MouseEvent ) => {
			const newRect = hasLockedRatio
				? computeLockedRect( dragState, event.clientX, event.clientY )
				: computeFreeRect( dragState, event.clientX, event.clientY );
			onCropChange( newRect );
		};

		const handleMouseUp = () => {
			setDragState( null );
			onResizeEnd?.();
		};

		// Pointer events on the captured element handle both mouse and
		// touch, and work across iframe boundaries.
		const el = dragElementRef.current;
		if ( el ) {
			el.addEventListener(
				'pointermove',
				handleMouseMove as EventListener
			);
			el.addEventListener( 'pointerup', handleMouseUp );
			el.addEventListener( 'lostpointercapture', handleMouseUp );
		} else {
			// Fallback for tests where the element ref isn't set.
			document.addEventListener( 'mousemove', handleMouseMove );
			document.addEventListener( 'mouseup', handleMouseUp );
		}

		return () => {
			if ( el ) {
				el.removeEventListener(
					'pointermove',
					handleMouseMove as EventListener
				);
				el.removeEventListener( 'pointerup', handleMouseUp );
				el.removeEventListener( 'lostpointercapture', handleMouseUp );
			} else {
				document.removeEventListener( 'mousemove', handleMouseMove );
				document.removeEventListener( 'mouseup', handleMouseUp );
			}
		};
	}, [
		dragState,
		hasLockedRatio,
		computeLockedRect,
		computeFreeRect,
		onCropChange,
		onResizeEnd,
	] );

	if ( containerSize.width === 0 || containerSize.height === 0 ) {
		return null;
	}

	const handles = hasLockedRatio ? CORNER_POSITIONS : ALL_POSITIONS;

	return (
		<div
			className="wp-media-editor-image-cropper__stencil"
			style={ {
				left,
				top,
				width,
				height,
				transition: stencilTransition,
			} }
		>
			{ /* The crop rectangle border. pointer-events: none is set in
				   CSS so clicks pass through to the container for panning. */ }
			<div
				className="wp-media-editor-image-cropper__stencil-rect"
				style={ {
					width: '100%',
					height: '100%',
					top: 0,
					left: 0,
				} }
			/>
			{ /* Resize handles — only in freeform mode */ }
			{ freeformCrop &&
				handles.map( ( pos ) => (
					// eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- resize handles need mouse and keyboard events.
					<div
						key={ pos }
						className={ `wp-media-editor-image-cropper__handle wp-media-editor-image-cropper__handle--${ pos }` }
						onPointerDown={ ( event ) =>
							handlePointerDown( pos, event )
						}
						onTouchStart={ ( event ) => event.stopPropagation() }
						onKeyDown={ ( event ) => handleKeyDown( pos, event ) }
						role="separator"
						aria-orientation={
							pos === 'n' || pos === 's'
								? 'horizontal'
								: 'vertical'
						}
						aria-label={ getHandleLabel( pos ) }
						tabIndex={ 0 }
					/>
				) ) }
		</div>
	);
}
