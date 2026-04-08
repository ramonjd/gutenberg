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

	// Check if AI providers are configured by reading settings via REST API.
	const [ aiProviders, setAiProviders ] = useState< string[] >( [] );
	useEffect( () => {
		// @ts-ignore -- wp.apiFetch is available globally in WP admin
		const apiFetch = window.wp?.apiFetch;
		if ( ! apiFetch ) {
			return;
		}
		apiFetch( { path: '/wp/v2/settings' } )
			.then( ( settings: any ) => {
				const providers: string[] = [];
				if ( settings?.connectors_ai_anthropic_api_key ) {
					providers.push( 'Anthropic (Claude)' );
				}
				if ( settings?.connectors_ai_openai_api_key ) {
					providers.push( 'OpenAI (GPT)' );
				}
				if ( settings?.connectors_ai_google_api_key ) {
					providers.push( 'Google (Gemini)' );
				}
				setAiProviders( providers );
			} )
			.catch( () => {
				// Settings not accessible — no AI providers shown.
			} );
	}, [] );

	// Map to the connectors shape expected by the AI tab.
	const connectors = aiProviders.map( ( name ) => ( { name } ) );

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

	// AI operations via REST API.
	// @ts-ignore -- wp.apiFetch is available globally in WP admin
	const apiFetch = ( window as any ).wp?.apiFetch;

	const [ aiResult, setAiResult ] = useState< string >( '' );

	const handleAICall = useCallback(
		async ( task: string, label: string ) => {
			if ( ! apiFetch ) {
				setAiResult( 'wp.apiFetch not available.' );
				return;
			}
			setAiLoading( true );
			setAiResult( '' );
			try {
				const response = await apiFetch( {
					path: '/wp/v2/media-editor/ai-analyze',
					method: 'POST',
					data: { image_url: src, task },
				} );
				const result = response?.result || '';

				if ( task === 'alt_text' ) {
					// Display the generated alt text.
					setAiResult( result );
				} else if ( task === 'smart_crop' ) {
					// Parse crop coordinates and apply.
					try {
						const parsed = JSON.parse( result );
						if ( parsed.x !== undefined ) {
							pushHistory( label );
							applyOperation( {
								type: 'crop',
								rect: parsed,
							} );
							setAiResult(
								`Crop applied: ${ JSON.stringify( parsed ) }`
							);
						}
					} catch {
						setAiResult( `AI response: ${ result }` );
					}
				} else if ( task === 'auto_straighten' ) {
					try {
						const parsed = JSON.parse( result );
						if ( parsed.degrees !== undefined ) {
							pushHistory( label );
							applyOperation( {
								type: 'rotate',
								degrees: parsed.degrees,
							} );
							setAiResult(
								`Straightened by ${ parsed.degrees }°`
							);
						}
					} catch {
						setAiResult( `AI response: ${ result }` );
					}
				}
			} catch ( error: any ) {
				setAiResult( error?.message || 'AI request failed.' );
			}
			setAiLoading( false );
		},
		[ apiFetch, src, pushHistory, applyOperation ]
	);

	const handleGenerateAltText = useCallback( () => {
		handleAICall( 'alt_text', 'Generate Alt Text' );
	}, [ handleAICall ] );

	const handleSmartCrop = useCallback( () => {
		handleAICall( 'smart_crop', 'AI Smart Crop' );
	}, [ handleAICall ] );

	const handleAutoStraighten = useCallback( () => {
		handleAICall( 'auto_straighten', 'AI Auto Straighten' );
	}, [ handleAICall ] );

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

			{ /* Tab buttons — AI tab only visible when providers are configured */ }
			<div className="media-editor-image-editing-panel__tabs">
				{ (
					( aiProviders.length > 0
						? [ 'crop', 'adjust', 'ai' ]
						: [ 'crop', 'adjust' ] ) as TabId[]
				 ).map( ( tab ) => (
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
						aiResult={ aiResult }
						onGenerateAltText={ handleGenerateAltText }
						onSmartCrop={ handleSmartCrop }
						onAutoStraighten={ handleAutoStraighten }
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
	aiResult,
	onGenerateAltText,
	onSmartCrop,
	onAutoStraighten,
}: {
	connectors: any[];
	aiLoading: boolean;
	aiResult: string;
	onGenerateAltText: () => void;
	onSmartCrop: () => void;
	onAutoStraighten: () => void;
} ) {
	return (
		<div className="media-editor-image-editing-panel__ai-panel">
			{ aiLoading && (
				<div className="media-editor-image-editing-panel__ai-loading">
					<Spinner />
					<span>{ __( 'Analyzing image\u2026' ) }</span>
				</div>
			) }

			<div className="media-editor-image-editing-panel__ai-section">
				<h4>
					{ __( 'Providers:' ) }{ ' ' }
					{ connectors.length > 0
						? connectors.map( ( c: any ) => c.name ).join( ', ' )
						: __( 'None' ) }
				</h4>
			</div>

			<div className="media-editor-image-editing-panel__ai-section">
				<Button
					variant="secondary"
					onClick={ onGenerateAltText }
					accessibleWhenDisabled
					disabled={ aiLoading }
					size="compact"
				>
					{ __( 'Generate Alt Text' ) }
				</Button>
				<Button
					variant="secondary"
					onClick={ onSmartCrop }
					accessibleWhenDisabled
					disabled={ aiLoading }
					size="compact"
				>
					{ __( 'Smart Crop' ) }
				</Button>
				<Button
					variant="secondary"
					onClick={ onAutoStraighten }
					accessibleWhenDisabled
					disabled={ aiLoading }
					size="compact"
				>
					{ __( 'Auto Straighten' ) }
				</Button>
			</div>

			{ aiResult && (
				<div className="media-editor-image-editing-panel__ai-result">
					<h4>{ __( 'Result' ) }</h4>
					<p>{ aiResult }</p>
				</div>
			) }
		</div>
	);
}
