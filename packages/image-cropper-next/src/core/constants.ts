/**
 * Internal dependencies
 */
import type { NormalizedRect, Flip, CropperState } from './types';

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 10;

/**
 * Maximum free-rotation offset in degrees from the nearest 90° step.
 * The rotation slider allows ±45° around the current cardinal angle.
 */
export const MAX_ROTATION_OFFSET = 45;

export const DEFAULT_CROP_RECT: NormalizedRect = {
	x: 0,
	y: 0,
	width: 1,
	height: 1,
};

export const DEFAULT_FLIP: Flip = {
	horizontal: false,
	vertical: false,
};

export const DEFAULT_CROP: { x: number; y: number } = {
	x: 0,
	y: 0,
};

export const DEFAULT_STATE: CropperState = {
	image: null,
	crop: { ...DEFAULT_CROP },
	zoom: MIN_ZOOM,
	rotation: 0,
	flip: { ...DEFAULT_FLIP },
	cropRect: { ...DEFAULT_CROP_RECT },
};
