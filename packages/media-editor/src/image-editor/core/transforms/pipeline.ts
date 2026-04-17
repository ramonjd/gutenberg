/**
 * Internal dependencies
 */
import type { TransformOperation, CropperState } from '../types';
import { DEFAULT_STATE } from '../constants';
import { normalizeRotation } from '../math/rotation';

/**
 * Valid operation type strings for deserialization validation.
 */
/**
 * Apply a single transform operation to a cropper state, returning a new state.
 *
 * @param state - The current cropper state.
 * @param op    - The operation to apply.
 * @return A new cropper state with the operation applied.
 */
export function applyOperationToState(
	state: CropperState,
	op: TransformOperation
): CropperState {
	switch ( op.type ) {
		case 'crop':
			return {
				...state,
				cropRect: { ...op.rect },
			};

		case 'rotate':
			return {
				...state,
				rotation: normalizeRotation( state.rotation + op.degrees ),
			};

		case 'flip':
			return {
				...state,
				flip: {
					...state.flip,
					[ op.direction ]: ! state.flip[ op.direction ],
				},
			};

		case 'zoom':
			return {
				...state,
				zoom: op.factor,
				baseZoom: op.factor,
			};
	}
}

/**
 * Replay all operations from an initial state to produce the final state.
 *
 * @param pipeline     - The array of transform operations to replay.
 * @param initialState - The starting state. Defaults to DEFAULT_STATE.
 * @return The resulting cropper state after all operations are applied.
 */
export function stateFromPipeline(
	pipeline: TransformOperation[],
	initialState: CropperState = { ...DEFAULT_STATE }
): CropperState {
	return pipeline.reduce(
		( state, op ) => applyOperationToState( state, op ),
		initialState
	);
}
