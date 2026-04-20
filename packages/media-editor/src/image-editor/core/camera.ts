/**
 * External dependencies
 */
import { mat2d, vec2 } from 'gl-matrix';

/**
 * Internal dependencies
 */
import type { CropperState, NormalizedPoint, Size, Camera } from './types';
import { degreesToRadians } from './math/rotation';

// Pre-allocated scratch buffers for `screenToWorld`, which is called per
// pointermove. Module-level singletons — safe because usage is synchronous.
const _scratchMat = mat2d.create();
const _scratchVec = vec2.create();

/**
 * Compute the axis-aligned bounding box of a rectangle after rotation.
 *
 * @param width    The width of the rectangle.
 * @param height   The height of the rectangle.
 * @param rotation The rotation angle in degrees.
 * @return The bounding box size after rotation.
 */
export function getRotatedBBox(
	width: number,
	height: number,
	rotation: number
): Size {
	const rad = degreesToRadians( rotation );
	const cosR = Math.abs( Math.cos( rad ) );
	const sinR = Math.abs( Math.sin( rad ) );
	return {
		width: cosR * width + sinR * height,
		height: sinR * width + cosR * height,
	};
}

/**
 * Compute the fitted (unrotated) image element dimensions and the visual
 * (rotated) bounding box dimensions for a given container, image, and rotation.
 *
 * When `cropRect` is provided and not full-frame, the fit scales so the crop
 * region (not the whole image) fills the container. The image overflows the
 * container on the other axis, hidden by the container's overflow clipping.
 * This maximises the stencil's screen size — matching the "fill the viewport"
 * behaviour users expect after selecting a thin slice.
 *
 * @param containerSize   The container dimensions in pixels.
 * @param imageSize       The natural image dimensions in pixels.
 * @param rotation        The rotation angle in degrees.
 * @param cropRect        Optional crop rectangle in normalized coords. When
 *                        omitted or full-frame, the whole image fits the
 *                        container (classic contain-fit).
 * @param cropRect.width  Crop width in normalized [0,1] coords.
 * @param cropRect.height Crop height in normalized [0,1] coords.
 * @return The fitted element size and visual bounding box size.
 */
export function getImageFit(
	containerSize: Size,
	imageSize: Size,
	rotation: number,
	cropRect?: { width: number; height: number }
): { elementSize: Size; visualSize: Size } {
	if (
		containerSize.width === 0 ||
		containerSize.height === 0 ||
		imageSize.width === 0 ||
		imageSize.height === 0
	) {
		return {
			elementSize: { width: 0, height: 0 },
			visualSize: { width: 0, height: 0 },
		};
	}
	// Snap rotation to the nearest 90° multiple for layout sizing.
	// This keeps the stencil a stable size through fine ±45° rotation
	// (no inflation at 15°/30° etc.) while still swapping aspect at
	// 90°/180°/270° so the snap rotate preserves the framed content.
	const snapRotation = Math.round( rotation / 90 ) * 90;
	const naturalBBox = getRotatedBBox(
		imageSize.width,
		imageSize.height,
		snapRotation
	);
	// Denominators for the contain fit. When a crop is provided, scale by
	// cropRect dims so the crop region (not the whole image) fits the
	// container — the image can overflow outside the container on the
	// unconstrained axis. Multiply by FIT_MARGIN (<1) to leave padding
	// around the crop so the resize handles have room to be dragged
	// outward without immediately hitting the container edge.
	const FIT_MARGIN = 0.9;
	const cropAware = cropRect && ( cropRect.width > 0 || cropRect.height > 0 );
	const cropW = cropRect && cropRect.width > 0 ? cropRect.width : 1;
	const cropH = cropRect && cropRect.height > 0 ? cropRect.height : 1;
	const marginDenom = cropAware ? FIT_MARGIN : 1;
	const fitScale = Math.min(
		( containerSize.width / ( naturalBBox.width * cropW ) ) * marginDenom,
		( containerSize.height / ( naturalBBox.height * cropH ) ) * marginDenom
	);
	const renderedW = imageSize.width * fitScale;
	const renderedH = imageSize.height * fitScale;
	const visualSize = getRotatedBBox( renderedW, renderedH, snapRotation );
	return {
		elementSize: { width: renderedW, height: renderedH },
		visualSize,
	};
}

/**
 * Compose a camera matrix from cropper state, container, and image dimensions.
 *
 * The matrix maps normalized world coordinates [0,1] x [0,1] to screen pixels.
 * Input (0,0) = image top-left, (1,1) = image bottom-right.
 *
 * Composition order (left-to-right = outermost first, applied last to point):
 *   M = T_containerCenter * T_pan * S_flip * R_rotation * S_zoom * T_center * S_toRenderedPixels
 *
 * Flip is composed outside rotation, so `flip.horizontal` / `flip.vertical`
 * are viewport-relative: the image mirrors across the viewport's vertical /
 * horizontal axis regardless of current rotation.
 *
 * @param state              The current cropper state.
 * @param containerSize      The size of the container in pixels.
 * @param imageSize          The natural size of the image in pixels.
 * @param fitCropRect        Optional crop rect to make the fit crop-aware.
 *                           Passed to `getImageFit` so the crop region fills
 *                           the container. Omit for classic contain-fit.
 * @param fitCropRect.width  Crop width in normalized [0,1] coords.
 * @param fitCropRect.height Crop height in normalized [0,1] coords.
 * @return The composed camera matrix.
 */
export function createCamera(
	state: CropperState,
	containerSize: Size,
	imageSize: Size,
	fitCropRect?: { width: number; height: number }
): Camera {
	const m = mat2d.create();

	if (
		containerSize.width === 0 ||
		containerSize.height === 0 ||
		imageSize.width === 0 ||
		imageSize.height === 0
	) {
		return m;
	}

	// Delegate the layout fit to getImageFit so the camera and the UI
	// (cropper.tsx, stencil positioning) always agree on elementSize /
	// visualSize. When `fitCropRect` is provided, the fit scales so the
	// crop region — not the whole image — fills the container.
	const { elementSize, visualSize } = getImageFit(
		containerSize,
		imageSize,
		state.rotation,
		fitCropRect
	);
	const renderedW = elementSize.width;
	const renderedH = elementSize.height;
	const visualW = visualSize.width;
	const visualH = visualSize.height;

	// Build matrix left-to-right (outermost first).
	// Innermost operations (last in code) are applied first to input point.

	// Outermost: translate to container center.
	mat2d.translate( m, m, [
		containerSize.width / 2,
		containerSize.height / 2,
	] );

	// Pan offset in visual-space pixels.
	mat2d.translate( m, m, [ state.pan.x * visualW, state.pan.y * visualH ] );

	// Flip (viewport-relative — composed outside rotation so horizontal
	// flip always mirrors across the viewport's vertical axis).
	mat2d.scale( m, m, [
		state.flip.horizontal ? -1 : 1,
		state.flip.vertical ? -1 : 1,
	] );

	// Rotate.
	mat2d.rotate( m, m, degreesToRadians( state.rotation ) );

	// Zoom.
	mat2d.scale( m, m, [ state.zoom, state.zoom ] );

	// Center origin (shift so 0.5,0.5 in rendered-pixel space = origin).
	mat2d.translate( m, m, [ -renderedW / 2, -renderedH / 2 ] );

	// Innermost: scale from normalized [0,1] to rendered pixels.
	mat2d.scale( m, m, [ renderedW, renderedH ] );

	return m;
}

/**
 * Transform a normalized world point [0,1] to screen pixels.
 *
 * @param camera The camera matrix from createCamera.
 * @param point  The normalized world coordinate to transform.
 * @return The screen pixel coordinate.
 */
export function worldToScreen(
	camera: Camera,
	point: NormalizedPoint
): { x: number; y: number } {
	const out = vec2.create();
	vec2.transformMat2d( out, [ point.x, point.y ], camera );
	return { x: out[ 0 ], y: out[ 1 ] };
}

/**
 * Transform a screen pixel point to normalized world coordinates [0,1].
 *
 * @param camera  The camera matrix from createCamera.
 * @param point   The screen pixel coordinate to transform.
 * @param point.x The x component of the screen pixel coordinate.
 * @param point.y The y component of the screen pixel coordinate.
 * @return The normalized world coordinate.
 */
export function screenToWorld(
	camera: Camera,
	point: { x: number; y: number }
): NormalizedPoint {
	mat2d.invert( _scratchMat, camera );
	const out = _scratchVec;
	vec2.transformMat2d( out, [ point.x, point.y ], _scratchMat );
	return { x: out[ 0 ], y: out[ 1 ] };
}

/**
 * The bounding box of a transformed region in screen (pixel) space.
 */
export interface VisualBounds {
	left: number;
	top: number;
	width: number;
	height: number;
}

/**
 * Compute the axis-aligned bounding box of a set of corners after
 * transforming them through a camera matrix.
 *
 * @param camera  The camera matrix from createCamera.
 * @param corners The corners to transform (each as [x, y]).
 * @return The screen-space bounding box.
 */
function aabb( camera: Camera, corners: [ number, number ][] ): VisualBounds {
	const screenCorners = corners.map( ( c ) => {
		const out = vec2.create();
		vec2.transformMat2d( out, c, camera );
		return out;
	} );
	let minX = screenCorners[ 0 ][ 0 ];
	let maxX = screenCorners[ 0 ][ 0 ];
	let minY = screenCorners[ 0 ][ 1 ];
	let maxY = screenCorners[ 0 ][ 1 ];
	for ( let i = 1; i < screenCorners.length; i++ ) {
		const s = screenCorners[ i ];
		if ( s[ 0 ] < minX ) {
			minX = s[ 0 ];
		}
		if ( s[ 0 ] > maxX ) {
			maxX = s[ 0 ];
		}
		if ( s[ 1 ] < minY ) {
			minY = s[ 1 ];
		}
		if ( s[ 1 ] > maxY ) {
			maxY = s[ 1 ];
		}
	}
	return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Returns the axis-aligned bounding box of the full image (normalized [0,1]x[0,1])
 * after applying the camera transform.
 *
 * @param camera The camera matrix from createCamera.
 * @return The screen-space bounding box of the full image.
 */
export function getVisibleBounds( camera: Camera ): VisualBounds {
	return aabb( camera, [
		[ 0, 0 ],
		[ 1, 0 ],
		[ 1, 1 ],
		[ 0, 1 ],
	] );
}

/**
 * Compose a camera matrix for exporting to a canvas.
 *
 * The resulting matrix maps image-pixel coordinates directly to output-canvas
 * coordinates. Apply it with `ctx.setTransform( ...camera )` then
 * `ctx.drawImage( image, 0, 0 )`.
 *
 * The transform chain mirrors the `renderToCanvas` function in canvas-renderer.ts:
 *   translate(visualCenter - cropOffset + outCenter) → flip → rotate → zoom → translate(-imgCenter)
 *
 * @param state      The current cropper state.
 * @param imageSize  The natural size of the source image in pixels.
 * @param outputSize The desired output canvas size in pixels.
 * @return The composed export camera matrix.
 */
export function createExportCamera(
	state: CropperState,
	imageSize: Size,
	outputSize: Size
): Camera {
	const m = mat2d.create();
	const { rotation, flip, cropRect, zoom, pan } = state;
	if (
		imageSize.width === 0 ||
		imageSize.height === 0 ||
		outputSize.width === 0 ||
		outputSize.height === 0
	) {
		return m;
	}
	// Reference frame for cropRect/pan is the snap-rotation bbox — that's
	// what the stencil and CSS matrix use in the preview (see createCamera
	// and getImageFit). Using the true rotation here would position the
	// crop window at a different offset than the stencil framed, and show
	// a shifted region after any fine rotation.
	const snapRotation = Math.round( rotation / 90 ) * 90;
	const { width: rotW, height: rotH } = getRotatedBBox(
		imageSize.width,
		imageSize.height,
		snapRotation
	);

	// Scale factor to map the natural crop region to the output canvas size.
	const naturalCropW = cropRect.width * rotW;
	const naturalCropH = cropRect.height * rotH;
	const outputScaleX = naturalCropW > 0 ? outputSize.width / naturalCropW : 1;
	const outputScaleY =
		naturalCropH > 0 ? outputSize.height / naturalCropH : 1;

	const cropOffsetX = cropRect.x * rotW + outputSize.width / 2 / outputScaleX;
	const cropOffsetY =
		cropRect.y * rotH + outputSize.height / 2 / outputScaleY;
	const visualCenterX = rotW / 2 + pan.x * rotW;
	const visualCenterY = rotH / 2 + pan.y * rotH;
	mat2d.scale( m, m, [ outputScaleX, outputScaleY ] );
	mat2d.translate( m, m, [
		visualCenterX - cropOffsetX + outputSize.width / 2 / outputScaleX,
		visualCenterY - cropOffsetY + outputSize.height / 2 / outputScaleY,
	] );
	// Flip is composed outside rotation so it acts in viewport/output space —
	// must match createCamera's order for preview and export to agree.
	mat2d.scale( m, m, [ flip.horizontal ? -1 : 1, flip.vertical ? -1 : 1 ] );
	mat2d.rotate( m, m, degreesToRadians( rotation ) );
	mat2d.scale( m, m, [ zoom, zoom ] );
	mat2d.translate( m, m, [ -imageSize.width / 2, -imageSize.height / 2 ] );
	return m;
}
