/**
 * External dependencies
 */

import clsx from 'clsx';

/**
 * WordPress dependencies
 */
import {
	useState,
	useCallback,
	useMemo,
	useRef,
	useEffect,
	forwardRef,
} from '@wordpress/element';

/**
 * Internal dependencies
 */
import type {
	CropperState,
	CropperAction,
	StencilProps,
	Size,
	NormalizedRect,
} from '../core/types';
import { getImageFit } from '../core/camera';
import { useInteraction } from '../hooks/use-interaction';
import { useTransformStyle } from '../hooks/use-transform-style';
import { RectangleStencil } from './stencils/rectangle-stencil';
import { DimmingOverlay } from './overlays/dimming-overlay';
import { GridOverlay } from './overlays/grid-overlay';
import './cropper.scss';

/**
 * Props for the Cropper component.
 */
export interface CropperProps {
	/** Image source URL. */
	src: string;
	/** Cropper state from useCropperState. */
	state: CropperState;
	/** Dispatch function from useCropperState. */
	dispatch: React.Dispatch< CropperAction >;
	/** Stencil component for the crop area. Defaults to RectangleStencil. */
	stencil?: React.ComponentType< StencilProps >;
	/** Show the rule-of-thirds grid overlay. */
	showGrid?: boolean;
	/** Show the dimming overlay outside the crop area. */
	showDimming?: boolean;
	/** Minimum zoom level. */
	minZoom?: number;
	/** Maximum zoom level. */
	maxZoom?: number;
	/** Fixed aspect ratio (width / height) in pixel space for the crop area. */
	aspectRatio?: number;
	/** Callback fired when the image is loaded. */
	onImageLoaded?: ( size: Size ) => void;
	/** Additional className for the container. */
	className?: string;
}

/**
 * The main image cropper component.
 *
 * Renders an image within a container with interactive crop overlays.
 * Creates the camera once per render via getImageFit, then passes
 * derived values to stencil, overlays, and interaction hooks.
 *
 * The component fills its parent container (100% width and height).
 * Wrap it in a sized container to control its dimensions.
 */
export const Cropper = forwardRef< HTMLDivElement, CropperProps >(
	function Cropper(
		{
			src,
			state,
			dispatch,
			stencil: StencilComponent = RectangleStencil,
			showGrid = false,
			showDimming = true,
			minZoom,
			maxZoom,
			aspectRatio,
			onImageLoaded,
			className,
		}: CropperProps,
		ref: React.ForwardedRef< HTMLDivElement >
	) {
		// Container measurement via ResizeObserver.
		const containerRef = useRef< HTMLDivElement >( null );
		const [ containerSize, setContainerSize ] = useState< Size >( {
			width: 0,
			height: 0,
		} );

		useEffect( () => {
			const element = containerRef.current;
			if ( ! element ) {
				return;
			}
			const observer = new ResizeObserver( ( entries ) => {
				for ( const entry of entries ) {
					const { width, height } = entry.contentRect;
					setContainerSize( ( prev ) => {
						if ( prev.width === width && prev.height === height ) {
							return prev;
						}
						return { width, height };
					} );
				}
			} );
			observer.observe( element );
			return () => {
				observer.disconnect();
			};
		}, [] );

		const [ naturalSize, setNaturalSize ] = useState< Size >( {
			width: 0,
			height: 0,
		} );

		// Compute fitted image dimensions and visual bounds from camera math.
		const { elementSize, visualSize } = useMemo(
			() => getImageFit( containerSize, naturalSize, state.rotation ),
			[ containerSize, naturalSize, state.rotation ]
		);

		// Use the interaction hook for mouse, touch, and keyboard events.
		const { handlers } = useInteraction(
			state,
			dispatch,
			containerSize,
			visualSize,
			{
				minZoom,
				maxZoom,
			}
		);

		// Use the transform style hook for the image CSS transform.
		const transformString = useTransformStyle(
			state,
			containerSize,
			visualSize
		);

		/**
		 * Handle the image load event.
		 */
		const handleImageLoad = useCallback(
			( event: React.SyntheticEvent< HTMLImageElement > ) => {
				const img = event.currentTarget;
				const size: Size = {
					width: img.naturalWidth,
					height: img.naturalHeight,
				};

				setNaturalSize( size );

				dispatch( {
					type: 'SET_IMAGE',
					payload: {
						src,
						naturalWidth: size.width,
						naturalHeight: size.height,
					},
				} );

				onImageLoaded?.( size );
			},
			[ src, dispatch, onImageLoaded ]
		);

		/**
		 * Handle crop rect changes from the stencil.
		 */
		const handleCropChange = useCallback(
			( rect: NormalizedRect ) => {
				dispatch( { type: 'SET_CROP_RECT', payload: rect } );
			},
			[ dispatch ]
		);

		// Compute the image's CSS style.
		const imageStyle = useMemo( (): React.CSSProperties => {
			if ( elementSize.width === 0 || elementSize.height === 0 ) {
				return {};
			}
			const centerX = ( containerSize.width - elementSize.width ) / 2;
			const centerY = ( containerSize.height - elementSize.height ) / 2;
			return {
				width: elementSize.width,
				height: elementSize.height,
				maxWidth: elementSize.width,
				maxHeight: elementSize.height,
				left: centerX,
				top: centerY,
				transform: transformString,
			};
		}, [ containerSize, elementSize, transformString ] );

		// Merge the forwarded ref with the internal container ref.
		const setContainerRef = useCallback(
			( element: HTMLDivElement | null ) => {
				(
					containerRef as React.MutableRefObject< HTMLDivElement | null >
				 ).current = element;
				if ( typeof ref === 'function' ) {
					ref( element );
				} else if ( ref ) {
					(
						ref as React.MutableRefObject< HTMLDivElement | null >
					 ).current = element;
				}
			},
			[ ref ]
		);

		return (
			<div
				ref={ setContainerRef }
				className={ clsx( 'wp-image-cropper-next', className ) }
				tabIndex={ 0 }
				role="application"
				aria-label="Image cropper"
				{ ...handlers }
			>
				{ /* The image layer */ }
				<img
					className="wp-image-cropper-next__image"
					src={ src }
					alt=""
					onLoad={ handleImageLoad }
					style={ imageStyle }
					draggable={ false }
				/>

				{ /* Dimming overlay outside the crop area */ }
				{ showDimming && (
					<DimmingOverlay
						cropRect={ state.cropRect }
						containerSize={ containerSize }
						imageSize={ visualSize }
					/>
				) }

				{ /* The stencil (crop area with handles) */ }
				<StencilComponent
					cropRect={ state.cropRect }
					containerSize={ containerSize }
					imageSize={ visualSize }
					onCropChange={ handleCropChange }
					aspectRatio={ aspectRatio }
				/>

				{ /* Rule-of-thirds grid */ }
				{ showGrid && (
					<GridOverlay
						cropRect={ state.cropRect }
						containerSize={ containerSize }
						imageSize={ visualSize }
					/>
				) }
			</div>
		);
	}
);
