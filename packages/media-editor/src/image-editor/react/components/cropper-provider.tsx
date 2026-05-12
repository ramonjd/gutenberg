/**
 * WordPress dependencies
 */
import {
	createContext,
	useContext,
	useMemo,
	useState,
} from '@wordpress/element';

/**
 * Internal dependencies
 */
import {
	useCropperState,
	type UseCropperStateReturn,
} from '../hooks/use-cropper-state';
import {
	useDerivedCropperMeasurements,
	type CropperMeasurements,
} from '../hooks/use-derived-cropper-measurements';
import type { CropperState, Size } from '../../core/types';

export type { CropperMeasurements };

interface CropperContextValue {
	controller: UseCropperStateReturn;
	canvasSize: Size;
	setCanvasSize: ( size: Size ) => void;
	measurements: CropperMeasurements;
}

const CropperContext = createContext< CropperContextValue | null >( null );

const ZERO_SIZE: Size = { width: 0, height: 0 };

interface CropperProviderProps {
	/** Optional partial initial state to merge with defaults. */
	initialState?: Partial< CropperState >;
	/** Child components. */
	children: React.ReactNode;
}

/**
 * Context provider wrapping `useCropperState` plus shared measurements.
 *
 * Holds three things and only three things:
 *  - the cropper state controller,
 *  - the measured canvas size (published by `<Cropper>` via `setCanvasSize`),
 *  - the derived measurements (`elementSize`, `visualSize`, `cropBounds`).
 *
 * Selector hooks (`useCropper`, `useCropperMeasurements`) read from the same
 * underlying value, so there is one source of truth and no derived-state
 * write-back.
 *
 * @param props              Provider props.
 * @param props.initialState Optional partial initial state.
 * @param props.children     Provider children.
 */
export function CropperProvider( {
	initialState,
	children,
}: CropperProviderProps ) {
	const controller = useCropperState( initialState );
	const [ canvasSize, setCanvasSize ] = useState< Size >( ZERO_SIZE );
	const measurements = useDerivedCropperMeasurements(
		controller.state,
		canvasSize
	);

	const value = useMemo< CropperContextValue >(
		() => ( {
			controller,
			canvasSize,
			setCanvasSize,
			measurements,
		} ),
		[ controller, canvasSize, measurements ]
	);

	return (
		<CropperContext.Provider value={ value }>
			{ children }
		</CropperContext.Provider>
	);
}

function useCropperContext(): CropperContextValue {
	const context = useContext( CropperContext );
	if ( ! context ) {
		throw new Error(
			'Cropper hooks must be used within a CropperProvider.'
		);
	}
	return context;
}

/**
 * Hook to consume the cropper state controller.
 *
 * Must be used within a `CropperProvider`. Throws if used outside.
 *
 * @return The cropper state and action creators.
 */
export function useCropper(): UseCropperStateReturn {
	return useCropperContext().controller;
}

/**
 * Hook to consume the derived cropper measurements (`elementSize`,
 * `visualSize`, `cropBounds`).
 *
 * @return Measurements derived from the cropper state and measured canvas.
 */
export function useCropperMeasurements(): CropperMeasurements {
	return useCropperContext().measurements;
}

/**
 * Hook used by `<Cropper>` to publish its measured canvas size into the
 * Provider. When no Provider is mounted, returns a noop so the component
 * still renders in standalone usage (Provider-only consumers like
 * `useCropGeometry` will simply not be readable in that mode).
 *
 * @return Setter for the canvas size, or a noop outside a CropperProvider.
 */
export function useOptionalSetCropperCanvasSize(): ( size: Size ) => void {
	const context = useContext( CropperContext );
	return context?.setCanvasSize ?? noopSetCanvasSize;
}

function noopSetCanvasSize() {}
