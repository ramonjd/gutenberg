/**
 * External dependencies
 */
import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * WordPress dependencies
 */
import {
	useState,
	useCallback,
	useEffect,
	useRef,
	useId,
} from '@wordpress/element';

/**
 * Internal dependencies
 */
import { Cropper } from '../react/components/cropper';
import { useCropperState } from '../react/hooks/use-cropper-state';
import {
	MIN_ZOOM,
	MAX_ZOOM,
	MAX_ROTATION_OFFSET,
	DEFAULT_ASPECT_RATIOS,
	ORIGINAL_ASPECT_RATIO,
} from '../core/constants';
import {
	loadImage,
	renderToCanvas,
	canvasToDataURL,
	downloadCroppedImage,
} from '../core/export/canvas-renderer';
import { getRotatedBBox, getSourceRegion } from '../core/camera';
import './style.css';

const SAMPLE_IMAGE = 'image-cropper-demo.png';

/**
 * Resolve an aspect ratio value from the select dropdown.
 * 0 = free (no lock), ORIGINAL_ASPECT_RATIO (-1) = image's natural ratio.
 */
function resolveAspectRatio(
	value: string,
	imageState: { naturalWidth: number; naturalHeight: number } | null
): number | undefined {
	const num = parseFloat( value );
	if ( num === 0 ) {
		return undefined; // Free — no lock.
	}
	if ( num === ORIGINAL_ASPECT_RATIO && imageState ) {
		return imageState.naturalWidth / imageState.naturalHeight;
	}
	if ( num > 0 ) {
		return num;
	}
	return undefined;
}

const meta: Meta< typeof Cropper > = {
	title: 'MediaEditor/ImageCropper',
	component: Cropper,
	tags: [ 'status-experimental' ],
};

export default meta;

type Story = StoryObj< typeof Cropper >;

/**
 * Default story. Basic cropper with a sample image, no controls.
 */
const DefaultComponent = () => {
	const { state, dispatch } = useCropperState();

	return (
		<div className="image-cropper-story__container">
			<Cropper
				src={ SAMPLE_IMAGE }
				state={ state }
				dispatch={ dispatch }
				showDimming
			/>
		</div>
	);
};

export const Default: Story = {
	render: DefaultComponent,
};

/**
 * Full interactive demo with controls.
 */
const WithControlsComponent = () => {
	const {
		state,
		dispatch,
		setRotation,
		setFlip,
		setZoom,
		setCropRect,
		snapRotate90,
		reset,
	} = useCropperState();

	const [ aspectRatioValue, setAspectRatioValue ] = useState( '0' );
	const [ freeformCrop, setFreeformCrop ] = useState( false );
	const [ exportFormat, setExportFormat ] = useState( 'image/jpeg' );

	// Compute the crop dimensions in source pixels.
	const cropDimensions = state.image
		? getSourceRegion( state, {
				width: state.image.naturalWidth,
				height: state.image.naturalHeight,
		  } )
		: null;

	// The base cardinal angle (nearest 90° step) and the fine offset.
	const baseAngle = Math.round( state.rotation / 90 ) * 90;
	const fineOffset = state.rotation - baseAngle;

	const handleRotateLeft = useCallback( () => {
		snapRotate90( -1 );
	}, [ snapRotate90 ] );

	const handleRotateRight = useCallback( () => {
		snapRotate90( 1 );
	}, [ snapRotate90 ] );

	const handleRotationSlider = useCallback(
		( event: React.ChangeEvent< HTMLInputElement > ) => {
			setRotation( baseAngle + parseFloat( event.target.value ) );
		},
		[ baseAngle, setRotation ]
	);

	const handleFlipHorizontal = useCallback( () => {
		setFlip( {
			horizontal: ! state.flip.horizontal,
			vertical: state.flip.vertical,
		} );
	}, [ state.flip, setFlip ] );

	const handleFlipVertical = useCallback( () => {
		setFlip( {
			horizontal: state.flip.horizontal,
			vertical: ! state.flip.vertical,
		} );
	}, [ state.flip, setFlip ] );

	const handleZoomChange = useCallback(
		( event: React.ChangeEvent< HTMLInputElement > ) => {
			setZoom( parseFloat( event.target.value ) );
		},
		[ setZoom ]
	);

	const handleAspectRatioChange = useCallback(
		( event: React.ChangeEvent< HTMLSelectElement > ) => {
			const value = event.target.value;
			setAspectRatioValue( value );

			// In fixed mode (freeformCrop=false), the cropper's useEffect
			// auto-computes the crop rect from the aspect ratio. In freeform
			// mode, we adjust the crop rect here to fit the new ratio.
			const resolved = resolveAspectRatio( value, state.image );
			if ( freeformCrop && resolved && resolved > 0 && state.image ) {
				const ratio = resolved;
				const natW = state.image.naturalWidth;
				const natH = state.image.naturalHeight;
				const visualBBox = getRotatedBBox( natW, natH, state.rotation );
				// normalizedRatio = w/h in normalized space that produces
				// the desired pixel aspect ratio.
				const normalizedRatio =
					( ratio * visualBBox.height ) / visualBBox.width;

				let w = state.cropRect.width;
				let h = w / normalizedRatio;

				if ( h > 1 ) {
					h = state.cropRect.height;
					w = h * normalizedRatio;
				}

				w = Math.min( w, 1 );
				h = Math.min( h, 1 );

				setCropRect( {
					x: ( 1 - w ) / 2,
					y: ( 1 - h ) / 2,
					width: w,
					height: h,
				} );
			}
		},
		[
			freeformCrop,
			state.image,
			state.cropRect,
			state.rotation,
			setCropRect,
		]
	);

	const handleReset = useCallback( () => {
		reset();
		setAspectRatioValue( '0' );
	}, [ reset ] );

	return (
		<div>
			<div className="image-cropper-story__controls">
				<div className="image-cropper-story__row">
					<strong>Rotation: { state.rotation }deg</strong>
					<button onClick={ handleRotateLeft }>-90</button>
					<button onClick={ handleRotateRight }>+90</button>
				</div>
				<input
					className="image-cropper-story__slider"
					type="range"
					min={ -MAX_ROTATION_OFFSET }
					max={ MAX_ROTATION_OFFSET }
					step="0.5"
					value={ fineOffset }
					onChange={ handleRotationSlider }
				/>

				<div className="image-cropper-story__row">
					<strong>
						Flip: H={ state.flip.horizontal ? 'Yes' : 'No' }, V=
						{ state.flip.vertical ? 'Yes' : 'No' }
					</strong>
					<button onClick={ handleFlipHorizontal }>
						Flip Horizontal
					</button>
					<button onClick={ handleFlipVertical }>
						Flip Vertical
					</button>
				</div>

				<div className="image-cropper-story__row">
					<strong>Zoom: { state.zoom.toFixed( 2 ) }</strong>
					<input
						type="range"
						min={ MIN_ZOOM }
						max={ MAX_ZOOM }
						step="0.1"
						value={ state.zoom }
						onChange={ handleZoomChange }
					/>
				</div>

				<div className="image-cropper-story__row">
					<strong>Aspect Ratio:</strong>
					<select
						value={ aspectRatioValue }
						onChange={ handleAspectRatioChange }
					>
						{ DEFAULT_ASPECT_RATIOS.map( ( preset ) => (
							<option
								key={ preset.label }
								value={ preset.value.toString() }
							>
								{ preset.label }
							</option>
						) ) }
					</select>
				</div>

				<div className="image-cropper-story__row">
					{ /* eslint-disable-next-line jsx-a11y/label-has-associated-control -- checkbox is nested */ }
					<label>
						<input
							type="checkbox"
							checked={ freeformCrop }
							onChange={ ( e ) =>
								setFreeformCrop( e.target.checked )
							}
						/>{ ' ' }
						Freeform Crop
					</label>
				</div>

				<div className="image-cropper-story__row">
					<button onClick={ handleReset }>Reset</button>
					<select
						value={ exportFormat }
						onChange={ ( e ) => setExportFormat( e.target.value ) }
					>
						<option value="image/jpeg">JPEG</option>
						<option value="image/png">PNG</option>
						<option value="image/webp">WebP</option>
					</select>
					<button
						onClick={ () =>
							downloadCroppedImage(
								SAMPLE_IMAGE,
								state,
								'cropped',
								exportFormat,
								0.9
							)
						}
					>
						Download
					</button>
					{ cropDimensions && (
						<span style={ { fontSize: 12, color: '#666' } }>
							{ Math.round( cropDimensions.width ) } &times;{ ' ' }
							{ Math.round( cropDimensions.height ) } px
						</span>
					) }
				</div>
			</div>

			<div className="image-cropper-story__container">
				<Cropper
					src={ SAMPLE_IMAGE }
					state={ state }
					dispatch={ dispatch }
					showGrid
					showDimming
					freeformCrop={ freeformCrop }
					aspectRatio={ resolveAspectRatio(
						aspectRatioValue,
						state.image
					) }
				/>
			</div>

			<div style={ { marginTop: 16 } }>
				<strong>Current State:</strong>
				<pre className="image-cropper-story__state">
					{ JSON.stringify(
						{
							rotation: state.rotation,
							zoom: state.zoom,
							cropRect: state.cropRect,
							crop: state.crop,
							image: state.image
								? {
										naturalWidth: state.image.naturalWidth,
										naturalHeight:
											state.image.naturalHeight,
								  }
								: null,
						},
						null,
						2
					) }
				</pre>
			</div>
		</div>
	);
};

export const WithControls: Story = {
	render: WithControlsComponent,
};

/**
 * Live crop preview showing the final export alongside the cropper.
 */
const WithPreviewComponent = () => {
	const {
		state,
		dispatch,
		setRotation,
		setFlip,
		setZoom,
		snapRotate90,
		reset,
	} = useCropperState();

	const [ freeformCrop, setFreeformCrop ] = useState( false );
	const freeformToggleId = useId();
	const [ previewSrc, setPreviewSrc ] = useState< string | null >( null );
	const imageRef = useRef< HTMLImageElement | null >( null );

	// Load the source image once.
	useEffect( () => {
		loadImage( SAMPLE_IMAGE ).then( ( img ) => {
			imageRef.current = img;
		} );
	}, [] );

	// Re-render the preview whenever state changes.
	useEffect( () => {
		if ( ! imageRef.current || ! state.image ) {
			return;
		}
		const canvas = renderToCanvas( imageRef.current, state );
		setPreviewSrc( canvasToDataURL( canvas, 'image/jpeg', 0.85 ) );
	}, [ state ] );

	// The base cardinal angle (nearest 90° step) and the fine offset.
	const baseAngle = Math.round( state.rotation / 90 ) * 90;
	const fineOffset = state.rotation - baseAngle;

	const handleRotateLeft = useCallback( () => {
		snapRotate90( -1 );
	}, [ snapRotate90 ] );

	const handleRotateRight = useCallback( () => {
		snapRotate90( 1 );
	}, [ snapRotate90 ] );

	const handleRotationSlider = useCallback(
		( event: React.ChangeEvent< HTMLInputElement > ) => {
			setRotation( baseAngle + parseFloat( event.target.value ) );
		},
		[ baseAngle, setRotation ]
	);

	const handleFlipHorizontal = useCallback( () => {
		setFlip( {
			horizontal: ! state.flip.horizontal,
			vertical: state.flip.vertical,
		} );
	}, [ state.flip, setFlip ] );

	const handleFlipVertical = useCallback( () => {
		setFlip( {
			horizontal: state.flip.horizontal,
			vertical: ! state.flip.vertical,
		} );
	}, [ state.flip, setFlip ] );

	const handleZoomChange = useCallback(
		( event: React.ChangeEvent< HTMLInputElement > ) => {
			setZoom( parseFloat( event.target.value ) );
		},
		[ setZoom ]
	);

	return (
		<div>
			<div className="image-cropper-story__controls">
				<div className="image-cropper-story__row">
					<strong>Rotation: { state.rotation }deg</strong>
					<button onClick={ handleRotateLeft }>-90</button>
					<button onClick={ handleRotateRight }>+90</button>
				</div>
				<input
					className="image-cropper-story__slider"
					type="range"
					min={ -MAX_ROTATION_OFFSET }
					max={ MAX_ROTATION_OFFSET }
					step="0.5"
					value={ fineOffset }
					onChange={ handleRotationSlider }
				/>

				<div className="image-cropper-story__row">
					<strong>
						Flip: H={ state.flip.horizontal ? 'Yes' : 'No' }, V=
						{ state.flip.vertical ? 'Yes' : 'No' }
					</strong>
					<button onClick={ handleFlipHorizontal }>
						Flip Horizontal
					</button>
					<button onClick={ handleFlipVertical }>
						Flip Vertical
					</button>
				</div>

				<div className="image-cropper-story__row">
					<strong>Zoom: { state.zoom.toFixed( 2 ) }</strong>
					<input
						type="range"
						min={ MIN_ZOOM }
						max={ MAX_ZOOM }
						step="0.1"
						value={ state.zoom }
						onChange={ handleZoomChange }
					/>
				</div>

				<div className="image-cropper-story__row">
					<label htmlFor={ freeformToggleId }>
						<input
							id={ freeformToggleId }
							type="checkbox"
							checked={ freeformCrop }
							onChange={ ( e ) =>
								setFreeformCrop( e.target.checked )
							}
						/>{ ' ' }
						Freeform crop
					</label>
					<button onClick={ () => reset() }>Reset</button>
				</div>
			</div>

			<div
				style={ { display: 'flex', gap: 24, alignItems: 'flex-start' } }
			>
				<div style={ { flex: '1 1 50%', minWidth: 0 } }>
					<strong>Cropper</strong>
					<div className="image-cropper-story__container">
						<Cropper
							src={ SAMPLE_IMAGE }
							state={ state }
							dispatch={ dispatch }
							showGrid
							showDimming
							freeformCrop={ freeformCrop }
						/>
					</div>
				</div>

				<div style={ { flex: '1 1 50%', minWidth: 0 } }>
					<strong>Export Preview</strong>
					{ previewSrc ? (
						<img
							className="image-cropper-story__export-image"
							src={ previewSrc }
							alt="Crop preview"
						/>
					) : (
						<p>Loading...</p>
					) }
				</div>
			</div>
		</div>
	);
};

export const WithPreview: Story = {
	render: WithPreviewComponent,
};
