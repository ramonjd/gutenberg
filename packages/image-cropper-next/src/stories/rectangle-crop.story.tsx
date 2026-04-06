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
import { Cropper } from '../components/cropper';
import { useCropperState } from '../hooks/use-cropper-state';
import type { TransformOperation } from '../core/types';
import {
	MIN_ZOOM,
	MAX_ZOOM,
	MAX_ROTATION_OFFSET,
	DEFAULT_ASPECT_RATIOS,
} from '../core/constants';
import {
	loadImage,
	renderToCanvas,
	canvasToDataURL,
	downloadCroppedImage,
} from '../core/export/canvas-renderer';
import { getRotatedBBox } from '../core/camera';
import './style.css';

const SAMPLE_IMAGE = '1-100-grid.webp';

const meta: Meta< typeof Cropper > = {
	title: 'ImageCropperNext/RectangleCrop',
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
		<div className="image-cropper-next-story__container">
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
			const ratio = parseFloat( value );
			if ( freeformCrop && ratio > 0 && state.image ) {
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
			<div className="image-cropper-next-story__controls">
				<div className="image-cropper-next-story__row">
					<strong>Rotation: { state.rotation }deg</strong>
					<button onClick={ handleRotateLeft }>-90</button>
					<button onClick={ handleRotateRight }>+90</button>
					<input
						type="range"
						min={ -MAX_ROTATION_OFFSET }
						max={ MAX_ROTATION_OFFSET }
						step="1"
						value={ fineOffset }
						onChange={ handleRotationSlider }
					/>
				</div>

				<div className="image-cropper-next-story__row">
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

				<div className="image-cropper-next-story__row">
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

				<div className="image-cropper-next-story__row">
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

				<div className="image-cropper-next-story__row">
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

				<div className="image-cropper-next-story__row">
					<button onClick={ handleReset }>Reset</button>
					<button
						onClick={ () =>
							downloadCroppedImage(
								SAMPLE_IMAGE,
								state,
								'cropped',
								'image/jpeg',
								0.9
							)
						}
					>
						Download
					</button>
				</div>
			</div>

			<div className="image-cropper-next-story__container">
				<Cropper
					src={ SAMPLE_IMAGE }
					state={ state }
					dispatch={ dispatch }
					showGrid
					showDimming
					freeformCrop={ freeformCrop }
					aspectRatio={
						parseFloat( aspectRatioValue ) > 0
							? parseFloat( aspectRatioValue )
							: undefined
					}
				/>
			</div>

			<div style={ { marginTop: 16 } }>
				<strong>Current State:</strong>
				<pre className="image-cropper-next-story__state">
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
 * Cropper inside a resizable container to demonstrate responsiveness.
 */
const ResizableContainerComponent = () => {
	const { state, dispatch } = useCropperState();

	return (
		<div>
			<p>
				Drag the bottom-right corner of the container to resize it. The
				cropper adapts automatically.
			</p>
			<div className="image-cropper-next-story__resizable">
				<Cropper
					src={ SAMPLE_IMAGE }
					state={ state }
					dispatch={ dispatch }
					showDimming
					showGrid
				/>
			</div>
		</div>
	);
};

export const ResizableContainer: Story = {
	render: ResizableContainerComponent,
};

/**
 * Demonstrates the programmatic JSON API for AI-friendly transforms.
 */
const ProgrammaticAPIComponent = () => {
	const { state, dispatch, applyOperation, reset } = useCropperState();
	const opsJsonId = useId();

	const defaultOps = JSON.stringify(
		[
			{ type: 'zoom', factor: 1.5 },
			{
				type: 'crop',
				rect: { x: 0.15, y: 0.1, width: 0.6, height: 0.7 },
			},
			{ type: 'rotate', degrees: 15 },
			{ type: 'flip', direction: 'horizontal' },
		],
		null,
		2
	);

	const [ jsonInput, setJsonInput ] = useState( defaultOps );
	const [ error, setError ] = useState< string | null >( null );

	const handleApply = useCallback( () => {
		setError( null );

		try {
			const operations = JSON.parse( jsonInput ) as TransformOperation[];

			if ( ! Array.isArray( operations ) ) {
				setError( 'Input must be a JSON array of operations.' );
				return;
			}

			for ( const op of operations ) {
				applyOperation( op );
			}
		} catch ( err ) {
			setError(
				err instanceof Error ? err.message : 'Failed to parse JSON.'
			);
		}
	}, [ jsonInput, applyOperation ] );

	const handleReset = useCallback( () => {
		reset();
		setError( null );
	}, [ reset ] );

	return (
		<div>
			<div className="image-cropper-next-story__controls">
				<label htmlFor={ opsJsonId }>
					<strong>Transform Operations (JSON):</strong>
				</label>
				<textarea
					id={ opsJsonId }
					className="image-cropper-next-story__json"
					value={ jsonInput }
					onChange={ ( e ) => setJsonInput( e.target.value ) }
				/>
				<div className="image-cropper-next-story__row">
					<button onClick={ handleApply }>Apply</button>
					<button onClick={ handleReset }>Reset</button>
				</div>
				{ error && (
					<div style={ { color: 'red' } }>Error: { error }</div>
				) }
			</div>

			<div className="image-cropper-next-story__container">
				<Cropper
					src={ SAMPLE_IMAGE }
					state={ state }
					dispatch={ dispatch }
					showDimming
					showGrid
				/>
			</div>

			<div style={ { marginTop: 16 } }>
				<strong>Current State:</strong>
				<pre className="image-cropper-next-story__state">
					{ JSON.stringify( state, null, 2 ) }
				</pre>
			</div>
		</div>
	);
};

export const ProgrammaticAPI: Story = {
	render: ProgrammaticAPIComponent,
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
			<div className="image-cropper-next-story__controls">
				<div className="image-cropper-next-story__row">
					<strong>Rotation: { state.rotation }deg</strong>
					<button onClick={ handleRotateLeft }>-90</button>
					<button onClick={ handleRotateRight }>+90</button>
					<input
						type="range"
						min={ -MAX_ROTATION_OFFSET }
						max={ MAX_ROTATION_OFFSET }
						step="1"
						value={ fineOffset }
						onChange={ handleRotationSlider }
					/>
				</div>

				<div className="image-cropper-next-story__row">
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

				<div className="image-cropper-next-story__row">
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

				<div className="image-cropper-next-story__row">
					<button onClick={ () => reset() }>Reset</button>
				</div>
			</div>

			<div
				style={ { display: 'flex', gap: 24, alignItems: 'flex-start' } }
			>
				<div>
					<strong>Cropper</strong>
					<div className="image-cropper-next-story__container">
						<Cropper
							src={ SAMPLE_IMAGE }
							state={ state }
							dispatch={ dispatch }
							showGrid
							showDimming
						/>
					</div>
				</div>

				<div className="image-cropper-next-story__export-preview">
					<strong>Export Preview</strong>
					{ previewSrc ? (
						<img
							className="image-cropper-next-story__export-image"
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

/**
 * Undo/redo history integration using the pipeline API.
 * Demonstrates how to build a non-destructive editing workflow
 * where every action is recorded and replayable.
 */
const UndoRedoComponent = () => {
	const { state, dispatch } = useCropperState();

	// Operation history: past and future stacks.
	const [ past, setPast ] = useState< TransformOperation[][] >( [] );
	const [ future, setFuture ] = useState< TransformOperation[][] >( [] );
	const [ pipeline, setPipeline ] = useState< TransformOperation[] >( [] );

	// Record an operation: push current pipeline to past, clear future.
	const recordOperation = useCallback(
		( op: TransformOperation ) => {
			setPast( ( prev ) => [ ...prev, pipeline ] );
			setFuture( [] );
			const newPipeline = [ ...pipeline, op ];
			setPipeline( newPipeline );

			// Apply the operation via dispatch.
			dispatch( { type: 'APPLY_OPERATION', payload: op } );
		},
		[ pipeline, dispatch ]
	);

	// Undo: pop from past, push current to future, replay.
	const undo = useCallback( () => {
		if ( past.length === 0 ) {
			return;
		}
		const newPast = [ ...past ];
		const previous = newPast.pop()!;
		setPast( newPast );
		setFuture( ( prev ) => [ ...prev, pipeline ] );
		setPipeline( previous );

		// Reset and replay the previous pipeline.
		dispatch( { type: 'RESET' } );
		for ( const op of previous ) {
			dispatch( { type: 'APPLY_OPERATION', payload: op } );
		}
	}, [ past, pipeline, dispatch ] );

	// Redo: pop from future, push current to past, replay.
	const redo = useCallback( () => {
		if ( future.length === 0 ) {
			return;
		}
		const newFuture = [ ...future ];
		const next = newFuture.pop()!;
		setPast( ( prev ) => [ ...prev, pipeline ] );
		setFuture( newFuture );
		setPipeline( next );

		// Reset and replay the next pipeline.
		dispatch( { type: 'RESET' } );
		for ( const op of next ) {
			dispatch( { type: 'APPLY_OPERATION', payload: op } );
		}
	}, [ future, pipeline, dispatch ] );

	// Keyboard shortcuts.
	useEffect( () => {
		const handler = ( e: KeyboardEvent ) => {
			if ( ( e.metaKey || e.ctrlKey ) && e.key === 'z' ) {
				e.preventDefault();
				if ( e.shiftKey ) {
					redo();
				} else {
					undo();
				}
			}
		};
		document.addEventListener( 'keydown', handler );
		return () => document.removeEventListener( 'keydown', handler );
	}, [ undo, redo ] );

	return (
		<div>
			<div className="image-cropper-next-story__controls">
				<div className="image-cropper-next-story__row">
					<button onClick={ undo } disabled={ past.length === 0 }>
						Undo ({ past.length })
					</button>
					<button onClick={ redo } disabled={ future.length === 0 }>
						Redo ({ future.length })
					</button>
					<button
						onClick={ () =>
							recordOperation( {
								type: 'rotate',
								degrees: 15,
							} )
						}
					>
						Rotate +15
					</button>
					<button
						onClick={ () =>
							recordOperation( {
								type: 'flip',
								direction: 'horizontal',
							} )
						}
					>
						Flip H
					</button>
					<button
						onClick={ () =>
							recordOperation( {
								type: 'zoom',
								factor: Math.min( MAX_ZOOM, state.zoom + 0.5 ),
							} )
						}
					>
						Zoom In
					</button>
					<button
						onClick={ () =>
							recordOperation( {
								type: 'crop',
								rect: {
									x: 0.1,
									y: 0.1,
									width: 0.8,
									height: 0.8,
								},
							} )
						}
					>
						Crop 80%
					</button>
				</div>
			</div>

			<div className="image-cropper-next-story__container">
				<Cropper
					src={ SAMPLE_IMAGE }
					state={ state }
					dispatch={ dispatch }
					showDimming
					freeformCrop
				/>
			</div>

			<div style={ { marginTop: 16 } }>
				<strong>Pipeline ({ pipeline.length } operations):</strong>
				<pre className="image-cropper-next-story__state">
					{ pipeline.length === 0
						? '(empty)'
						: pipeline
								.map(
									( op, i ) =>
										`${ i + 1 }. ${ op.type }${
											'degrees' in op
												? ` ${ op.degrees }°`
												: ''
										}${
											'direction' in op
												? ` ${ op.direction }`
												: ''
										}${
											'factor' in op
												? ` ${ op.factor }x`
												: ''
										}${
											'rect' in op
												? ` (${ Math.round(
														op.rect.width * 100
												  ) }%×${ Math.round(
														op.rect.height * 100
												  ) }%)`
												: ''
										}`
								)
								.join( '\n' ) }
				</pre>
				<p style={ { fontSize: 12, color: '#666' } }>
					Tip: Ctrl+Z / Cmd+Z to undo, Ctrl+Shift+Z / Cmd+Shift+Z to
					redo
				</p>
			</div>
		</div>
	);
};

export const UndoRedo: Story = {
	render: UndoRedoComponent,
};
