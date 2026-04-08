/**
 * WordPress dependencies
 */
import {
	Button,
	RangeControl,
	Spinner,
	SelectControl,
} from '@wordpress/components';
import { useState, useCallback, useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import {
	rotateLeft,
	rotateRight,
	flipHorizontal,
	flipVertical,
	undo as undoIcon,
	redo as redoIcon,
} from '@wordpress/icons';

/**
 * Internal dependencies -- image-cropper-next
 */
// @ts-ignore -- workspace package, types built separately
import {
	Cropper,
	useCropperState,
	DEFAULT_ASPECT_RATIOS,
	downloadCroppedImage,
	getSourceRegion,
} from '@wordpress/image-cropper-next';

/**
 * Internal dependencies
 */
import './style.scss';

type TabId = 'crop' | 'adjust' | 'ai';

interface ImageEditingPanelProps {
	src: string;
	onClose?: () => void;
}

interface HistoryEntry {
	state: any;
	label: string;
}

interface AdjustState {
	brightness: number;
	contrast: number;
	saturation: number;
}

const DEFAULT_ADJUST: AdjustState = {
	brightness: 100,
	contrast: 100,
	saturation: 100,
};

/**
 * ImageEditingPanel provides a Google Photos-inspired editing experience
 * with Crop, Adjust, and AI panels.
 *
 * @param props         Component props.
 * @param props.src     The image source URL.
 * @param props.onClose Callback when the panel is closed.
 * @return The rendered component.
 */
export default function ImageEditingPanel( {
	src,
	onClose,
}: ImageEditingPanelProps ) {
	const [ activeTab, setActiveTab ] = useState< TabId >( 'crop' );
	const [ aspectRatio, setAspectRatio ] = useState< number >( 0 );
	const [ freeformCrop, setFreeformCrop ] = useState( true );
	const [ adjust, setAdjust ] = useState< AdjustState >( DEFAULT_ADJUST );
	const [ aiLoading, setAiLoading ] = useState( false );
	const aiTimerRef = useRef< ReturnType< typeof setTimeout > >();

	// Clean up AI timer on unmount.
	useEffect( () => {
		return () => {
			if ( aiTimerRef.current ) {
				clearTimeout( aiTimerRef.current );
			}
		};
	}, [] );

	// Cropper state
	const {
		state,
		dispatch,
		setZoom,
		setRotation,
		setFlip,
		snapRotate90,
		applyOperation,
		reset,
		isDirty,
	} = useCropperState();

	// Undo / redo history
	const [ past, setPast ] = useState< HistoryEntry[] >( [] );
	const [ future, setFuture ] = useState< HistoryEntry[] >( [] );

	const pushHistory = useCallback(
		( label: string ) => {
			setPast( ( prev ) => [ ...prev, { state: { ...state }, label } ] );
			setFuture( [] );
		},
		[ state ]
	);

	const handleUndo = useCallback( () => {
		if ( past.length === 0 ) {
			return;
		}
		const prev = [ ...past ];
		const entry = prev.pop()!;
		setPast( prev );
		setFuture( ( f ) => [ ...f, { state: { ...state }, label: 'undo' } ] );
		reset( entry.state );
	}, [ past, state, reset ] );

	const handleRedo = useCallback( () => {
		if ( future.length === 0 ) {
			return;
		}
		const next = [ ...future ];
		const entry = next.pop()!;
		setFuture( next );
		setPast( ( p ) => [ ...p, { state: { ...state }, label: 'redo' } ] );
		reset( entry.state );
	}, [ future, state, reset ] );

	// Keyboard shortcuts: Ctrl+Z / Ctrl+Shift+Z
	useEffect( () => {
		function handleKeyDown( e: KeyboardEvent ) {
			if ( ( e.ctrlKey || e.metaKey ) && e.key === 'z' ) {
				e.preventDefault();
				if ( e.shiftKey ) {
					handleRedo();
				} else {
					handleUndo();
				}
			}
		}
		window.addEventListener( 'keydown', handleKeyDown );
		return () => window.removeEventListener( 'keydown', handleKeyDown );
	}, [ handleUndo, handleRedo ] );

	// AI connectors — mocked for now. When the connectors API is
	// available as a WordPress script, this can read from the store.
	const connectors: any[] = [];

	// Handle aspect ratio change
	const handleAspectRatioChange = useCallback( ( value: string ) => {
		const num = parseFloat( value );
		setAspectRatio( num );
		setFreeformCrop( num === 0 );
	}, [] );

	// Handle rotation with history
	const handleSnapRotate = useCallback(
		( direction: 1 | -1 ) => {
			pushHistory( direction === 1 ? 'Rotate right' : 'Rotate left' );
			snapRotate90( direction );
		},
		[ pushHistory, snapRotate90 ]
	);

	// Handle flip with history
	const handleFlip = useCallback(
		( direction: 'horizontal' | 'vertical' ) => {
			pushHistory( `Flip ${ direction }` );
			setFlip( {
				...state.flip,
				[ direction ]: ! state.flip[ direction ],
			} );
		},
		[ pushHistory, setFlip, state.flip ]
	);

	// Fine rotation
	const handleFineRotation = useCallback(
		( value: number | undefined ) => {
			if ( value === undefined ) {
				return;
			}
			setRotation( value );
		},
		[ setRotation ]
	);

	// Download
	const handleDownload = useCallback( async () => {
		if ( ! state.image ) {
			return;
		}
		await downloadCroppedImage( src, state, 'cropped-image' );
	}, [ src, state ] );

	// Reset all
	const handleReset = useCallback( () => {
		pushHistory( 'Reset' );
		reset();
		setAdjust( DEFAULT_ADJUST );
	}, [ pushHistory, reset ] );

	// Mock AI operations
	const handleMockAI = useCallback(
		( label: string, ops: any[] ) => {
			setAiLoading( true );
			aiTimerRef.current = setTimeout( () => {
				pushHistory( label );
				for ( const op of ops ) {
					applyOperation( op );
				}
				setAiLoading( false );
			}, 1500 );
		},
		[ pushHistory, applyOperation ]
	);

	const handleAutoStraighten = useCallback( () => {
		handleMockAI( 'Auto Straighten', [ { type: 'rotate', degrees: 2 } ] );
	}, [ handleMockAI ] );

	const handleCenterSubject = useCallback( () => {
		handleMockAI( 'Center Subject', [
			{
				type: 'crop',
				rect: { x: 0.15, y: 0.1, width: 0.7, height: 0.8 },
			},
		] );
	}, [ handleMockAI ] );

	const handleSmartCrop = useCallback(
		( providerName: string ) => {
			handleMockAI( `Smart Crop with ${ providerName }`, [
				{
					type: 'crop',
					rect: { x: 0.1, y: 0.05, width: 0.8, height: 0.9 },
				},
				{ type: 'rotate', degrees: 1 },
			] );
		},
		[ handleMockAI ]
	);

	// Compute source region for display
	const sourceRegion = state.image
		? getSourceRegion( state, {
				width: state.image.naturalWidth,
				height: state.image.naturalHeight,
		  } )
		: null;

	// CSS filter for adjustments
	const filterStyle =
		adjust.brightness !== 100 ||
		adjust.contrast !== 100 ||
		adjust.saturation !== 100
			? `brightness(${ adjust.brightness / 100 }) contrast(${
					adjust.contrast / 100
			  }) saturate(${ adjust.saturation / 100 })`
			: undefined;

	return (
		<div className="media-editor-image-editing-panel">
			{ /* Canvas area */ }
			<div
				className="media-editor-image-editing-panel__canvas"
				style={ filterStyle ? { filter: filterStyle } : undefined }
			>
				<Cropper
					src={ src }
					state={ state }
					dispatch={ dispatch }
					showGrid
					showDimming
					aspectRatio={ aspectRatio > 0 ? aspectRatio : undefined }
					freeformCrop={ freeformCrop }
				/>
			</div>

			{ /* Tab buttons */ }
			<div className="media-editor-image-editing-panel__tabs">
				{ ( [ 'crop', 'adjust', 'ai' ] as TabId[] ).map( ( tab ) => (
					<Button
						key={ tab }
						variant={ activeTab === tab ? 'primary' : 'secondary' }
						size="compact"
						onClick={ () => setActiveTab( tab ) }
						className="media-editor-image-editing-panel__tab-button"
					>
						{ tab === 'crop' && __( 'Crop' ) }
						{ tab === 'adjust' && __( 'Adjust' ) }
						{ tab === 'ai' && __( 'AI' ) }
					</Button>
				) ) }
			</div>

			{ /* Panel content */ }
			<div className="media-editor-image-editing-panel__panel">
				{ activeTab === 'crop' && (
					<CropPanel
						aspectRatio={ aspectRatio }
						onAspectRatioChange={ handleAspectRatioChange }
						freeformCrop={ freeformCrop }
						onFreeformToggle={ () =>
							setFreeformCrop( ( prev ) => ! prev )
						}
						rotation={ state.rotation }
						onFineRotation={ handleFineRotation }
						zoom={ state.zoom }
						onZoom={ ( v ) => {
							if ( v !== undefined ) {
								setZoom( v );
							}
						} }
						onSnapRotate={ handleSnapRotate }
						onFlip={ handleFlip }
					/>
				) }
				{ activeTab === 'adjust' && (
					<AdjustPanel
						adjust={ adjust }
						onAdjustChange={ setAdjust }
					/>
				) }
				{ activeTab === 'ai' && (
					<AIPanel
						connectors={ connectors }
						aiLoading={ aiLoading }
						onSmartCrop={ handleSmartCrop }
						onAutoStraighten={ handleAutoStraighten }
						onCenterSubject={ handleCenterSubject }
					/>
				) }
			</div>

			{ /* Bottom toolbar */ }
			<div className="media-editor-image-editing-panel__toolbar">
				<div className="media-editor-image-editing-panel__toolbar-left">
					<Button
						icon={ undoIcon }
						label={ __( 'Undo' ) }
						accessibleWhenDisabled
						disabled={ past.length === 0 }
						onClick={ handleUndo }
						size="compact"
					/>
					<Button
						icon={ redoIcon }
						label={ __( 'Redo' ) }
						accessibleWhenDisabled
						disabled={ future.length === 0 }
						onClick={ handleRedo }
						size="compact"
					/>
					<Button
						variant="tertiary"
						accessibleWhenDisabled
						disabled={ ! isDirty }
						onClick={ handleReset }
						size="compact"
					>
						{ __( 'Reset' ) }
					</Button>
				</div>
				<div className="media-editor-image-editing-panel__toolbar-center">
					{ sourceRegion && (
						<span className="media-editor-image-editing-panel__dimensions">
							{ Math.round( sourceRegion.width ) }
							{ ' \u00d7 ' }
							{ Math.round( sourceRegion.height ) }
							{ __( 'px' ) }
						</span>
					) }
				</div>
				<div className="media-editor-image-editing-panel__toolbar-right">
					{ onClose && (
						<Button
							variant="tertiary"
							onClick={ onClose }
							size="compact"
						>
							{ __( 'Cancel' ) }
						</Button>
					) }
					<Button
						variant="primary"
						onClick={ handleDownload }
						accessibleWhenDisabled
						disabled={ ! state.image }
						size="compact"
					>
						{ __( 'Download' ) }
					</Button>
				</div>
			</div>
		</div>
	);
}

/* -- Sub-panels ------------------------------------------------- */

function CropPanel( {
	aspectRatio,
	onAspectRatioChange,
	freeformCrop,
	onFreeformToggle,
	rotation,
	onFineRotation,
	zoom,
	onZoom,
	onSnapRotate,
	onFlip,
}: {
	aspectRatio: number;
	onAspectRatioChange: ( v: string ) => void;
	freeformCrop: boolean;
	onFreeformToggle: () => void;
	rotation: number;
	onFineRotation: ( v: number | undefined ) => void;
	zoom: number;
	onZoom: ( v: number | undefined ) => void;
	onSnapRotate: ( d: 1 | -1 ) => void;
	onFlip: ( d: 'horizontal' | 'vertical' ) => void;
} ) {
	const aspectOptions = DEFAULT_ASPECT_RATIOS.map( ( preset ) => ( {
		label: preset.label,
		value: String( preset.value ),
	} ) );

	// The fine rotation offset from the nearest 90-degree step.
	const nearest90 = Math.round( rotation / 90 ) * 90;
	const fineOffset = rotation - nearest90;

	return (
		<div className="media-editor-image-editing-panel__crop-panel">
			<div className="media-editor-image-editing-panel__row">
				<SelectControl
					__nextHasNoMarginBottom
					__next40pxDefaultSize
					label={ __( 'Aspect ratio' ) }
					value={ String( aspectRatio ) }
					options={ aspectOptions }
					onChange={ onAspectRatioChange }
				/>
				<Button
					variant={ freeformCrop ? 'primary' : 'secondary' }
					onClick={ onFreeformToggle }
					size="compact"
				>
					{ __( 'Freeform' ) }
				</Button>
			</div>
			<div className="media-editor-image-editing-panel__row">
				<Button
					icon={ rotateLeft }
					label={ __( 'Rotate left' ) }
					onClick={ () => onSnapRotate( -1 ) }
					size="compact"
				/>
				<Button
					icon={ rotateRight }
					label={ __( 'Rotate right' ) }
					onClick={ () => onSnapRotate( 1 ) }
					size="compact"
				/>
				<Button
					icon={ flipHorizontal }
					label={ __( 'Flip horizontal' ) }
					onClick={ () => onFlip( 'horizontal' ) }
					size="compact"
				/>
				<Button
					icon={ flipVertical }
					label={ __( 'Flip vertical' ) }
					onClick={ () => onFlip( 'vertical' ) }
					size="compact"
				/>
			</div>
			<RangeControl
				__nextHasNoMarginBottom
				__next40pxDefaultSize
				label={ __( 'Fine rotation' ) }
				value={ fineOffset }
				onChange={ ( v ) =>
					onFineRotation(
						v !== undefined ? nearest90 + v : undefined
					)
				}
				min={ -45 }
				max={ 45 }
				step={ 0.1 }
			/>
			<RangeControl
				__nextHasNoMarginBottom
				__next40pxDefaultSize
				label={ __( 'Zoom' ) }
				value={ zoom }
				onChange={ onZoom }
				min={ 1 }
				max={ 10 }
				step={ 0.1 }
			/>
		</div>
	);
}

function AdjustPanel( {
	adjust,
	onAdjustChange,
}: {
	adjust: AdjustState;
	onAdjustChange: ( a: AdjustState ) => void;
} ) {
	return (
		<div className="media-editor-image-editing-panel__adjust-panel">
			<RangeControl
				__nextHasNoMarginBottom
				__next40pxDefaultSize
				label={ `${ __( 'Brightness' ) } (${ adjust.brightness }%)` }
				value={ adjust.brightness }
				onChange={ ( v ) =>
					onAdjustChange( {
						...adjust,
						brightness: v ?? 100,
					} )
				}
				min={ 50 }
				max={ 200 }
			/>
			<RangeControl
				__nextHasNoMarginBottom
				__next40pxDefaultSize
				label={ `${ __( 'Contrast' ) } (${ adjust.contrast }%)` }
				value={ adjust.contrast }
				onChange={ ( v ) =>
					onAdjustChange( {
						...adjust,
						contrast: v ?? 100,
					} )
				}
				min={ 50 }
				max={ 200 }
			/>
			<RangeControl
				__nextHasNoMarginBottom
				__next40pxDefaultSize
				label={ `${ __( 'Saturation' ) } (${ adjust.saturation }%)` }
				value={ adjust.saturation }
				onChange={ ( v ) =>
					onAdjustChange( {
						...adjust,
						saturation: v ?? 100,
					} )
				}
				min={ 0 }
				max={ 200 }
			/>
			<Button
				variant="tertiary"
				onClick={ () => onAdjustChange( DEFAULT_ADJUST ) }
				size="compact"
			>
				{ __( 'Reset adjustments' ) }
			</Button>
		</div>
	);
}

function AIPanel( {
	connectors,
	aiLoading,
	onSmartCrop,
	onAutoStraighten,
	onCenterSubject,
}: {
	connectors: any[];
	aiLoading: boolean;
	onSmartCrop: ( name: string ) => void;
	onAutoStraighten: () => void;
	onCenterSubject: () => void;
} ) {
	return (
		<div className="media-editor-image-editing-panel__ai-panel">
			{ aiLoading && (
				<div className="media-editor-image-editing-panel__ai-loading">
					<Spinner />
					<span>{ __( 'Processing\u2026' ) }</span>
				</div>
			) }

			<div className="media-editor-image-editing-panel__ai-section">
				<h4>{ __( 'Quick actions' ) }</h4>
				<Button
					variant="secondary"
					onClick={ onAutoStraighten }
					accessibleWhenDisabled
					disabled={ aiLoading }
					size="compact"
				>
					{ __( 'Auto Straighten' ) }
				</Button>
				<Button
					variant="secondary"
					onClick={ onCenterSubject }
					accessibleWhenDisabled
					disabled={ aiLoading }
					size="compact"
				>
					{ __( 'Center Subject' ) }
				</Button>
			</div>

			<div className="media-editor-image-editing-panel__ai-section">
				<h4>{ __( 'AI Providers' ) }</h4>
				{ connectors.length > 0 ? (
					connectors.map( ( connector: any ) => (
						<Button
							key={ connector.id || connector.name }
							variant="secondary"
							onClick={ () =>
								onSmartCrop( connector.name || connector.id )
							}
							accessibleWhenDisabled
							disabled={ aiLoading }
							size="compact"
						>
							{ `${ __( 'Smart Crop with' ) } ${
								connector.name || connector.id
							}` }
						</Button>
					) )
				) : (
					<p className="media-editor-image-editing-panel__ai-hint">
						{ __(
							'Configure AI providers in Settings \u2192 Connectors to enable AI features.'
						) }
					</p>
				) }
			</div>
		</div>
	);
}
