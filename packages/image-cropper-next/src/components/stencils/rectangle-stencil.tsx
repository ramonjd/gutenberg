/**
 * WordPress dependencies
 */
import { useState, useCallback, useEffect, useMemo } from '@wordpress/element';

/**
 * Internal dependencies
 */
import type { StencilProps, NormalizedRect } from '../../core/types';

/**
 * Handle position identifiers for the 8 resize handles.
 */
type HandlePosition = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

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
 * Step size for keyboard-driven handle resize, in normalized coordinates.
 */
const KEYBOARD_STEP = 0.02;

/**
 * Internal drag state for tracking a resize interaction.
 */
interface DragState {
	/** Which handle is being dragged. */
	handle: HandlePosition;
	/** The mouse position (pixels) when the drag started. */
	startX: number;
	startY: number;
	/** The crop rect (normalized) when the drag started. */
	startRect: NormalizedRect;
}

/**
 * Internal state for tracking a crop-area move interaction.
 */
interface MoveState {
	/** The mouse position (pixels) when the move started. */
	startX: number;
	startY: number;
	/** The crop rect (normalized) when the move started. */
	startRect: NormalizedRect;
}

/**
 * Props for the RectangleStencil component.
 */
type RectangleStencilProps = StencilProps;

/**
 * A rectangular crop stencil with resize handles and move support.
 *
 * In freeform mode, clicking and dragging inside the crop area moves
 * the entire crop rect. Clicking on handles resizes it. Both are
 * constrained to cropBounds (image edge or container edge).
 *
 * @param props                   Component props implementing StencilProps.
 * @param props.cropRect          The crop rectangle in normalized coordinates.
 * @param props.containerSize     The container element dimensions in pixels.
 * @param props.imageSize         The rendered image dimensions in pixels.
 * @param props.onCropChange      Callback fired when the crop rect changes.
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
	const [ dragState, setDragState ] = useState< DragState | null >( null );
	const [ moveState, setMoveState ] = useState< MoveState | null >( null );
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
	 * Start a resize drag on a handle.
	 */
	const handleMouseDown = useCallback(
		( handle: HandlePosition, event: React.MouseEvent ) => {
			event.preventDefault();
			event.stopPropagation();
			setDragState( {
				handle,
				startX: event.clientX,
				startY: event.clientY,
				startRect: { ...cropRect },
			} );
		},
		[ cropRect ]
	);

	/**
	 * Start a move drag on the crop area interior.
	 */
	const handleMoveMouseDown = useCallback(
		( event: React.MouseEvent ) => {
			event.preventDefault();
			event.stopPropagation();
			setMoveState( {
				startX: event.clientX,
				startY: event.clientY,
				startRect: { ...cropRect },
			} );
		},
		[ cropRect ]
	);

	/**
	 * Compute the new crop rect for a free (no aspect ratio) resize.
	 */
	const computeFreeRect = useCallback(
		(
			drag: DragState,
			clientX: number,
			clientY: number
		): NormalizedRect => {
			const dx =
				imageSize.width > 0
					? ( clientX - drag.startX ) / imageSize.width
					: 0;
			const dy =
				imageSize.height > 0
					? ( clientY - drag.startY ) / imageSize.height
					: 0;

			const s = drag.startRect;
			const handle = drag.handle;
			const minSize = 0.05;

			let edgeTop = s.y;
			let edgeBottom = s.y + s.height;
			let edgeLeft = s.x;
			let edgeRight = s.x + s.width;

			if ( handle === 'n' || handle === 'nw' || handle === 'ne' ) {
				edgeTop = Math.max(
					boundsMinY,
					Math.min( s.y + dy, edgeBottom - minSize )
				);
			}
			if ( handle === 's' || handle === 'sw' || handle === 'se' ) {
				edgeBottom = Math.max(
					edgeTop + minSize,
					Math.min( s.y + s.height + dy, boundsMaxY )
				);
			}
			if ( handle === 'w' || handle === 'nw' || handle === 'sw' ) {
				edgeLeft = Math.max(
					boundsMinX,
					Math.min( s.x + dx, edgeRight - minSize )
				);
			}
			if ( handle === 'e' || handle === 'ne' || handle === 'se' ) {
				edgeRight = Math.max(
					edgeLeft + minSize,
					Math.min( s.x + s.width + dx, boundsMaxX )
				);
			}

			return {
				x: edgeLeft,
				y: edgeTop,
				width: edgeRight - edgeLeft,
				height: edgeBottom - edgeTop,
			};
		},
		[
			imageSize.width,
			imageSize.height,
			boundsMinX,
			boundsMinY,
			boundsMaxX,
			boundsMaxY,
		]
	);

	/**
	 * Compute the new crop rect for a locked-aspect-ratio corner resize.
	 *
	 * The opposite corner is the anchor. The dragged corner moves freely
	 * but the result is clamped to maintain the aspect ratio and stay
	 * within bounds.
	 */
	const computeLockedRect = useCallback(
		(
			drag: DragState,
			clientX: number,
			clientY: number
		): NormalizedRect => {
			const dx =
				imageSize.width > 0
					? ( clientX - drag.startX ) / imageSize.width
					: 0;
			const dy =
				imageSize.height > 0
					? ( clientY - drag.startY ) / imageSize.height
					: 0;

			const s = drag.startRect;
			const handle = drag.handle;
			const minSize = 0.05;

			// Determine the anchor corner (opposite to the dragged corner).
			const anchorX =
				handle === 'nw' || handle === 'sw' ? s.x + s.width : s.x;
			const anchorY =
				handle === 'nw' || handle === 'ne' ? s.y + s.height : s.y;

			// Direction the crop grows from the anchor (+1 = right/down, -1 = left/up).
			const dirX = handle === 'nw' || handle === 'sw' ? -1 : 1;
			const dirY = handle === 'nw' || handle === 'ne' ? -1 : 1;

			// Desired new position of the dragged corner.
			const draggedX =
				( handle === 'nw' || handle === 'sw' ? s.x : s.x + s.width ) +
				dx;
			const draggedY =
				( handle === 'nw' || handle === 'ne' ? s.y : s.y + s.height ) +
				dy;

			// Raw distances from anchor to dragged corner.
			let distW = ( draggedX - anchorX ) * dirX;
			let distH = ( draggedY - anchorY ) * dirY;

			// Enforce minimum size.
			distW = Math.max( distW, minSize );
			distH = Math.max( distH, minSize );

			// Determine which axis "drives" — whichever the user moved more
			// (in pixel space) determines the size, the other follows.
			const pixelDistW = distW * imageSize.width;
			const pixelDistH = distH * imageSize.height;
			if ( pixelDistW / pixelDistH > normalizedRatio ) {
				// Width is the driver — compute height from ratio.
				distH = distW / normalizedRatio;
			} else {
				// Height is the driver — compute width from ratio.
				distW = distH * normalizedRatio;
			}

			// Clamp to image coverage bounds. If the rect would exceed,
			// shrink it (maintaining ratio) to fit.
			const maxW = dirX > 0 ? boundsMaxX - anchorX : anchorX - boundsMinX;
			const maxH = dirY > 0 ? boundsMaxY - anchorY : anchorY - boundsMinY;

			if ( distW > maxW ) {
				distW = maxW;
				distH = distW / normalizedRatio;
			}
			if ( distH > maxH ) {
				distH = maxH;
				distW = distH * normalizedRatio;
			}

			// Enforce minimum after clamping.
			distW = Math.max( distW, minSize );
			distH = Math.max( distH, minSize );

			// Compute the final rect position from the anchor.
			const newX = dirX > 0 ? anchorX : anchorX - distW;
			const newY = dirY > 0 ? anchorY : anchorY - distH;

			return { x: newX, y: newY, width: distW, height: distH };
		},
		[
			imageSize.width,
			imageSize.height,
			normalizedRatio,
			boundsMinX,
			boundsMinY,
			boundsMaxX,
			boundsMaxY,
		]
	);

	/**
	 * Compute a moved crop rect, clamped to bounds.
	 */
	const computeMovedRect = useCallback(
		(
			move: MoveState,
			clientX: number,
			clientY: number
		): NormalizedRect => {
			const dx =
				imageSize.width > 0
					? ( clientX - move.startX ) / imageSize.width
					: 0;
			const dy =
				imageSize.height > 0
					? ( clientY - move.startY ) / imageSize.height
					: 0;

			const s = move.startRect;

			// Clamp so the entire rect stays within bounds.
			const newX = Math.max(
				boundsMinX,
				Math.min( s.x + dx, boundsMaxX - s.width )
			);
			const newY = Math.max(
				boundsMinY,
				Math.min( s.y + dy, boundsMaxY - s.height )
			);

			return { x: newX, y: newY, width: s.width, height: s.height };
		},
		[
			imageSize.width,
			imageSize.height,
			boundsMinX,
			boundsMinY,
			boundsMaxX,
			boundsMaxY,
		]
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
				const syntheticDrag: DragState = {
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
			} else {
				// For freeform resize, synthesize a drag via computeFreeRect.
				const syntheticDrag: DragState = {
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

		document.addEventListener( 'mousemove', handleMouseMove );
		document.addEventListener( 'mouseup', handleMouseUp );

		return () => {
			document.removeEventListener( 'mousemove', handleMouseMove );
			document.removeEventListener( 'mouseup', handleMouseUp );
		};
	}, [
		dragState,
		hasLockedRatio,
		computeLockedRect,
		computeFreeRect,
		onCropChange,
		onResizeEnd,
	] );

	// Handle move drag events.
	useEffect( () => {
		if ( ! moveState ) {
			return;
		}

		const handleMouseMove = ( event: MouseEvent ) => {
			onCropChange(
				computeMovedRect( moveState, event.clientX, event.clientY )
			);
		};

		const handleMouseUp = () => {
			setMoveState( null );
		};

		document.addEventListener( 'mousemove', handleMouseMove );
		document.addEventListener( 'mouseup', handleMouseUp );

		return () => {
			document.removeEventListener( 'mousemove', handleMouseMove );
			document.removeEventListener( 'mouseup', handleMouseUp );
		};
	}, [ moveState, computeMovedRect, onCropChange ] );

	if ( containerSize.width === 0 || containerSize.height === 0 ) {
		return null;
	}

	const handles = hasLockedRatio ? CORNER_POSITIONS : ALL_POSITIONS;

	return (
		<div
			className="wp-image-cropper-next__stencil"
			style={ {
				left,
				top,
				width,
				height,
				transition: stencilTransition,
			} }
		>
			{ /* The crop rectangle interior — draggable in freeform mode */ }
			{ /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- crop area needs mouse events for move drag */ }
			<div
				className="wp-image-cropper-next__stencil-rect"
				style={ {
					width: '100%',
					height: '100%',
					top: 0,
					left: 0,
					cursor: freeformCrop ? 'move' : undefined,
					pointerEvents: freeformCrop ? 'auto' : 'none',
				} }
				onMouseDown={ freeformCrop ? handleMoveMouseDown : undefined }
			/>
			{ /* Resize handles — only in freeform mode */ }
			{ freeformCrop &&
				handles.map( ( pos ) => (
					// eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- resize handles need mouse and keyboard events.
					<div
						key={ pos }
						className={ `wp-image-cropper-next__handle wp-image-cropper-next__handle--${ pos }` }
						onMouseDown={ ( event ) =>
							handleMouseDown( pos, event )
						}
						onKeyDown={ ( event ) => handleKeyDown( pos, event ) }
						role="separator"
						aria-orientation={
							pos === 'n' || pos === 's'
								? 'horizontal'
								: 'vertical'
						}
						aria-label={ `Resize ${ pos }` }
						tabIndex={ 0 }
					/>
				) ) }
		</div>
	);
}
