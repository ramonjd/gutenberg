/**
 * Internal dependencies
 */
import type { CropperState, TransformOperation } from '../../types';
import { DEFAULT_STATE } from '../../constants';
import { applyOperationToState, stateFromPipeline } from '../pipeline';

describe( 'applyOperationToState', () => {
	let baseState: CropperState;

	beforeEach( () => {
		baseState = {
			...DEFAULT_STATE,
			flip: { ...DEFAULT_STATE.flip },
			crop: { ...DEFAULT_STATE.crop },
			cropRect: { ...DEFAULT_STATE.cropRect },
		};
	} );

	it( 'should handle crop: set cropRect', () => {
		const result = applyOperationToState( baseState, {
			type: 'crop',
			rect: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
		} );

		expect( result.cropRect ).toEqual( {
			x: 0.1,
			y: 0.2,
			width: 0.5,
			height: 0.6,
		} );
	} );

	it( 'should handle rotate: add degrees and normalize', () => {
		const result = applyOperationToState( baseState, {
			type: 'rotate',
			degrees: 90,
		} );

		expect( result.rotation ).toBe( 90 );
	} );

	it( 'should handle rotate: accumulate and normalize past 360', () => {
		let state = applyOperationToState( baseState, {
			type: 'rotate',
			degrees: 270,
		} );
		state = applyOperationToState( state, {
			type: 'rotate',
			degrees: 180,
		} );

		// 270 + 180 = 450 -> 90 (normalized)
		expect( state.rotation ).toBe( 90 );
	} );

	it( 'should handle rotate: negative degrees normalize correctly', () => {
		const result = applyOperationToState( baseState, {
			type: 'rotate',
			degrees: -90,
		} );

		expect( result.rotation ).toBe( 270 );
	} );

	it( 'should handle flip horizontal: toggle on', () => {
		const result = applyOperationToState( baseState, {
			type: 'flip',
			direction: 'horizontal',
		} );

		expect( result.flip.horizontal ).toBe( true );
		expect( result.flip.vertical ).toBe( false );
	} );

	it( 'should handle flip horizontal: toggle off', () => {
		const flippedState: CropperState = {
			...baseState,
			flip: { horizontal: true, vertical: false },
		};

		const result = applyOperationToState( flippedState, {
			type: 'flip',
			direction: 'horizontal',
		} );

		expect( result.flip.horizontal ).toBe( false );
		expect( result.flip.vertical ).toBe( false );
	} );

	it( 'should handle flip vertical: toggle on', () => {
		const result = applyOperationToState( baseState, {
			type: 'flip',
			direction: 'vertical',
		} );

		expect( result.flip.horizontal ).toBe( false );
		expect( result.flip.vertical ).toBe( true );
	} );

	it( 'should handle zoom: set zoom factor', () => {
		const result = applyOperationToState( baseState, {
			type: 'zoom',
			factor: 3.5,
		} );

		expect( result.zoom ).toBe( 3.5 );
	} );

	it( 'should not mutate the original state', () => {
		const original = { ...baseState };
		applyOperationToState( baseState, {
			type: 'rotate',
			degrees: 90,
		} );

		expect( baseState.rotation ).toBe( original.rotation );
	} );
} );

describe( 'stateFromPipeline', () => {
	it( 'should return default state for an empty pipeline', () => {
		const result = stateFromPipeline( [] );
		expect( result.rotation ).toBe( 0 );
		expect( result.zoom ).toBe( 1 );
		expect( result.flip ).toEqual( { horizontal: false, vertical: false } );
	} );

	it( 'should apply a sequence of operations correctly', () => {
		const pipeline: TransformOperation[] = [
			{ type: 'rotate', degrees: 45 },
			{ type: 'flip', direction: 'horizontal' },
			{ type: 'zoom', factor: 2 },
			{
				type: 'crop',
				rect: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
			},
		];

		const result = stateFromPipeline( pipeline );

		expect( result.rotation ).toBe( 45 );
		expect( result.flip.horizontal ).toBe( true );
		expect( result.flip.vertical ).toBe( false );
		expect( result.zoom ).toBe( 2 );
		expect( result.cropRect ).toEqual( {
			x: 0.25,
			y: 0.25,
			width: 0.5,
			height: 0.5,
		} );
	} );

	it( 'should use custom initial state when provided', () => {
		const customInitial: CropperState = {
			...DEFAULT_STATE,
			rotation: 90,
			zoom: 2,
			flip: { horizontal: true, vertical: false },
			crop: { ...DEFAULT_STATE.crop },
			cropRect: { ...DEFAULT_STATE.cropRect },
		};

		const pipeline: TransformOperation[] = [
			{ type: 'rotate', degrees: 90 },
		];

		const result = stateFromPipeline( pipeline, customInitial );

		// 90 (initial) + 90 (operation) = 180
		expect( result.rotation ).toBe( 180 );
		// Other state should carry forward.
		expect( result.zoom ).toBe( 2 );
		expect( result.flip.horizontal ).toBe( true );
	} );
} );
