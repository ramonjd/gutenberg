/**
 * Internal dependencies
 */
import type { CropperState, Size } from './types';
import { degreesToRadians } from './math/rotation';

/**
 * Computes a CSS matrix() transform string from the cropper state.
 *
 * The combined transform is: translate(tx, ty) * rotate(r) * scale(sx*z, sy*z)
 * expressed as a 2D CSS matrix(a, b, c, d, tx, ty).
 *
 * This is a pure function with no framework dependencies. The React hook
 * `useTransformStyle` wraps this in `useMemo` for memoization.
 *
 * @param state     The current cropper state.
 * @param imageSize The rendered image dimensions in pixels.
 * @return A CSS transform string.
 */
export function computeTransformStyle(
	state: CropperState,
	imageSize: Size
): string {
	const translateX = state.crop.x * imageSize.width;
	const translateY = state.crop.y * imageSize.height;
	const rad = degreesToRadians( state.rotation );
	const cos = Math.cos( rad );
	const sin = Math.sin( rad );
	const sx = state.flip.horizontal ? -1 : 1;
	const sy = state.flip.vertical ? -1 : 1;
	const z = state.zoom;

	// Combined: translate(tx,ty) * rotate(r) * scale(sx*z, sy*z)
	const a = cos * sx * z;
	const b = sin * sx * z;
	const c = -sin * sy * z;
	const d = cos * sy * z;

	return `matrix(${ a }, ${ b }, ${ c }, ${ d }, ${ translateX }, ${ translateY })`;
}
