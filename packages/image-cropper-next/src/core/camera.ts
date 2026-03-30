/**
 * External dependencies
 */
import { mat2d, vec2 } from 'gl-matrix';

/**
 * Internal dependencies
 */
import type {
	CropperState,
	NormalizedPoint,
	NormalizedRect,
	Size,
	Camera,
} from './types';
import { degreesToRadians } from './math/rotation';

/**
 * Compute the fitted (unrotated) image element dimensions and the visual
 * (rotated) bounding box dimensions for a given container, image, and rotation.
 *
 * This is the same "contain" fit logic used by createCamera, extracted so
 * cropper.tsx can size the <img> element and position overlays without
 * duplicating the math.
 *
 * @param containerSize The container dimensions in pixels.
 * @param imageSize     The natural image dimensions in pixels.
 * @param rotation      The rotation angle in degrees.
 * @return The fitted element size and visual bounding box size.
 */
export function getImageFit(
	containerSize: Size,
	imageSize: Size,
	rotation: number
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
	const rad = degreesToRadians( rotation );
	const cosR = Math.abs( Math.cos( rad ) );
	const sinR = Math.abs( Math.sin( rad ) );
	const rotW = cosR * imageSize.width + sinR * imageSize.height;
	const rotH = sinR * imageSize.width + cosR * imageSize.height;
	const fitScale = Math.min(
		containerSize.width / rotW,
		containerSize.height / rotH
	);
	const renderedW = imageSize.width * fitScale;
	const renderedH = imageSize.height * fitScale;
	const visualW = cosR * renderedW + sinR * renderedH;
	const visualH = sinR * renderedW + cosR * renderedH;
	return {
		elementSize: { width: renderedW, height: renderedH },
		visualSize: { width: visualW, height: visualH },
	};
}

/**
 * Compose a camera matrix from cropper state, container, and image dimensions.
 *
 * The matrix maps normalized world coordinates [0,1] x [0,1] to screen pixels.
 * Input (0,0) = image top-left, (1,1) = image bottom-right.
 *
 * Composition order (left-to-right = outermost first, applied last to point):
 *   M = T_containerCenter * T_pan * R_rotation * S_flip * S_zoom * T_center * S_toRenderedPixels
 *
 * @param state         The current cropper state (zoom, rotation, flip, crop).
 * @param containerSize The size of the container in pixels.
 * @param imageSize     The natural size of the image in pixels.
 * @return The composed camera matrix.
 */
export function createCamera(
	state: CropperState,
	containerSize: Size,
	imageSize: Size
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

	const rad = degreesToRadians( state.rotation );
	const cosR = Math.abs( Math.cos( rad ) );
	const sinR = Math.abs( Math.sin( rad ) );

	// Rotated bounding box of the natural image.
	const rotW = cosR * imageSize.width + sinR * imageSize.height;
	const rotH = sinR * imageSize.width + cosR * imageSize.height;

	// "Contain" fit: scale rotated bounding box to fit within container.
	const fitScale = Math.min(
		containerSize.width / rotW,
		containerSize.height / rotH
	);

	// The rendered (unrotated) image dimensions at this fit scale.
	const renderedW = imageSize.width * fitScale;
	const renderedH = imageSize.height * fitScale;

	// Visual (rotated) image footprint in pixels.
	const visualW = cosR * renderedW + sinR * renderedH;
	const visualH = sinR * renderedW + cosR * renderedH;

	// Build matrix left-to-right (outermost first).
	// Innermost operations (last in code) are applied first to input point.

	// Outermost: translate to container center.
	mat2d.translate( m, m, [
		containerSize.width / 2,
		containerSize.height / 2,
	] );

	// Pan offset in visual-space pixels.
	mat2d.translate( m, m, [ state.crop.x * visualW, state.crop.y * visualH ] );

	// Rotate.
	mat2d.rotate( m, m, degreesToRadians( state.rotation ) );

	// Flip (negative scale).
	mat2d.scale( m, m, [
		state.flip.horizontal ? -1 : 1,
		state.flip.vertical ? -1 : 1,
	] );

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
	const inv = mat2d.create();
	mat2d.invert( inv, camera );
	const out = vec2.create();
	vec2.transformMat2d( out, [ point.x, point.y ], inv );
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
 * Returns the axis-aligned bounding box of the full image (normalized [0,1]x[0,1])
 * after applying the camera transform.
 *
 * @param camera The camera matrix from createCamera.
 * @return The screen-space bounding box of the full image.
 */
export function getVisibleBounds( camera: Camera ): VisualBounds {
	const corners = [
		[ 0, 0 ],
		[ 1, 0 ],
		[ 1, 1 ],
		[ 0, 1 ],
	];
	const screenCorners = corners.map( ( c ) => {
		const out = vec2.create();
		vec2.transformMat2d( out, c as [ number, number ], camera );
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
 * Returns the axis-aligned bounding box of a crop rectangle in screen (pixel) space.
 *
 * @param camera   The camera matrix from createCamera.
 * @param cropRect The crop rectangle in normalized coordinates.
 * @return The screen-space bounding box of the crop rectangle.
 */
export function cropRectToScreenBounds(
	camera: Camera,
	cropRect: NormalizedRect
): VisualBounds {
	const { x, y, width, height } = cropRect;
	const corners = [
		[ x, y ],
		[ x + width, y ],
		[ x + width, y + height ],
		[ x, y + height ],
	];
	const screenCorners = corners.map( ( c ) => {
		const out = vec2.create();
		vec2.transformMat2d( out, c as [ number, number ], camera );
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
 * Alias for cropRectToScreenBounds — transforms a normalized rect to screen bounds.
 *
 * @param camera The camera matrix from createCamera.
 * @param rect   The rectangle in normalized coordinates.
 * @return The screen-space bounding box of the rectangle.
 */
export function worldToScreenRect(
	camera: Camera,
	rect: NormalizedRect
): VisualBounds {
	return cropRectToScreenBounds( camera, rect );
}

/**
 * Clamps a value to the normalized [0, 1] range.
 *
 * @param value The value to clamp.
 * @return The clamped value.
 */
export function clampNormalized( value: number ): number {
	return Math.min( 1, Math.max( 0, value ) );
}

/**
 * Compute the visual (rotated) bounding-box dimensions in pixel-proportional
 * units where the unrotated image is `a × 1` (renderedW = a, renderedH = 1).
 *
 * @param rotation         Rotation angle in degrees.
 * @param imageAspectRatio Image width / height ratio.
 * @return Visual dimensions and trig helpers.
 */
function getVisualDimensions(
	rotation: number,
	imageAspectRatio: number
): { visualW: number; visualH: number; absC: number; absS: number } {
	const rad = degreesToRadians( rotation );
	const absC = Math.abs( Math.cos( rad ) );
	const absS = Math.abs( Math.sin( rad ) );
	return {
		visualW: absC * imageAspectRatio + absS,
		visualH: absS * imageAspectRatio + absC,
		absC,
		absS,
	};
}

/**
 * Calculates the minimum zoom factor needed for the rotated image to fully cover
 * the crop rectangle, using normalized coordinates and imageAspectRatio.
 *
 * Works in pixel-proportional space where the unrotated image is a×1.
 * The crop rect is in visual-normalized space and must be scaled by the
 * rotation-dependent visual dimensions before projecting into the image-local
 * frame.
 *
 * @param rotation         Rotation angle in degrees.
 * @param imageAspectRatio Image width / height ratio.
 * @param cropRect         The crop rectangle in normalized coordinates.
 * @return The minimum zoom factor (always >= 1).
 */
export function getMinZoomForCover(
	rotation: number,
	imageAspectRatio: number,
	cropRect: NormalizedRect
): number {
	const a = Math.max( imageAspectRatio, Number.EPSILON );
	const { visualW, visualH, absC, absS } = getVisualDimensions( rotation, a );

	// Crop half-extents in pixel-proportional space.
	const cropHalfW = ( cropRect.width * visualW ) / 2;
	const cropHalfH = ( cropRect.height * visualH ) / 2;

	// AABB of the crop rect projected into the image-local (unrotated) frame.
	const spanAlpha = cropHalfW * absC + cropHalfH * absS;
	const spanBeta = cropHalfW * absS + cropHalfH * absC;

	// Image half-extents at zoom z: (a*z/2, z/2).
	// Coverage requires: a*z/2 >= spanAlpha  AND  z/2 >= spanBeta.
	const zoomFromAlpha = ( 2 * spanAlpha ) / a;
	const zoomFromBeta = 2 * spanBeta;

	return Math.max( 1, zoomFromAlpha, zoomFromBeta );
}

/**
 * Compute the maximum crop rect bounds in normalized space for the given
 * zoom, rotation, and container. This tells the stencil how far handles
 * can be dragged while the image still covers the crop area AND the crop
 * stays within the container viewport.
 *
 * At zoom=1, rotation=0, the bounds are [0,1]×[0,1] (the full visual area).
 * At higher zoom, the image coverage extends further, but the container
 * boundary limits how far handles can go.
 *
 * @param zoom             The current zoom factor.
 * @param rotation         The rotation angle in degrees.
 * @param imageAspectRatio The image width / height ratio.
 * @param containerSize    The container dimensions in pixels.
 * @param visualSize       The visual (rotated) image dimensions in pixels.
 * @return The min/max x and y that a crop rect edge can reach.
 */
export function getCropBounds(
	zoom: number,
	rotation: number,
	imageAspectRatio: number,
	containerSize?: Size,
	visualSize?: Size
): { minX: number; minY: number; maxX: number; maxY: number } {
	const a = Math.max( imageAspectRatio, Number.EPSILON );
	const { visualW, visualH, absC, absS } = getVisualDimensions( rotation, a );

	// Image half-extents at zoom z in pixel-proportional space.
	const imgHalfW = ( a * zoom ) / 2;
	const imgHalfH = zoom / 2;

	// Compute image-coverage bounds: how far each axis can extend
	// while the image still covers the point on the centerline.
	let halfExtentX = 0.5;
	if ( visualW > 0 ) {
		let extX = Infinity;
		if ( absC > 1e-9 ) {
			extX = Math.min( extX, imgHalfW / ( visualW * absC ) );
		}
		if ( absS > 1e-9 ) {
			extX = Math.min( extX, imgHalfH / ( visualW * absS ) );
		}
		halfExtentX = Math.min( extX, 10 );
	}

	let halfExtentY = 0.5;
	if ( visualH > 0 ) {
		let extY = Infinity;
		if ( absC > 1e-9 ) {
			extY = Math.min( extY, imgHalfH / ( visualH * absC ) );
		}
		if ( absS > 1e-9 ) {
			extY = Math.min( extY, imgHalfW / ( visualH * absS ) );
		}
		halfExtentY = Math.min( extY, 10 );
	}

	let minX = 0.5 - halfExtentX;
	let minY = 0.5 - halfExtentY;
	let maxX = 0.5 + halfExtentX;
	let maxY = 0.5 + halfExtentY;

	// Clamp to container boundaries. The container may be larger than the
	// visual image (padding on sides), so the normalized container extent
	// can go below 0 or above 1. But crop handles should never leave the
	// container viewport.
	if (
		containerSize &&
		visualSize &&
		visualSize.width > 0 &&
		visualSize.height > 0
	) {
		const offsetX = ( containerSize.width - visualSize.width ) / 2;
		const offsetY = ( containerSize.height - visualSize.height ) / 2;
		// Container left edge in normalized space.
		const containerMinX = -offsetX / visualSize.width;
		const containerMaxX =
			( containerSize.width - offsetX ) / visualSize.width;
		const containerMinY = -offsetY / visualSize.height;
		const containerMaxY =
			( containerSize.height - offsetY ) / visualSize.height;

		minX = Math.max( minX, containerMinX );
		minY = Math.max( minY, containerMinY );
		maxX = Math.min( maxX, containerMaxX );
		maxY = Math.min( maxY, containerMaxY );
	}

	return { minX, minY, maxX, maxY };
}

/**
 * Restricts a crop rectangle so that the rotated, zoomed image can fully cover it.
 * If the crop rect is too large for the current zoom and rotation, it is scaled
 * down proportionally and re-centered.
 *
 * Works in pixel-proportional space where the unrotated image is a×1.
 *
 * @param cropRect         The crop rectangle in normalized coordinates.
 * @param zoom             The current zoom factor.
 * @param rotation         The rotation angle in degrees.
 * @param imageAspectRatio The image width / height ratio.
 * @return The restricted crop rectangle.
 */
export function restrictCropRect(
	cropRect: NormalizedRect,
	zoom: number,
	rotation: number,
	imageAspectRatio: number
): NormalizedRect {
	const a = Math.max( imageAspectRatio, Number.EPSILON );
	const { visualW, visualH, absC, absS } = getVisualDimensions( rotation, a );
	const W = cropRect.width;
	const H = cropRect.height;

	// Crop full-extents in pixel-proportional space, projected to image-local frame.
	const cropWPx = W * visualW;
	const cropHPx = H * visualH;
	const spanAlpha = cropWPx * absC + cropHPx * absS;
	const spanBeta = cropWPx * absS + cropHPx * absC;

	// Image full-extents at zoom z: (a*z, z).
	const limitAlpha = a * zoom;
	const limitBeta = zoom;

	let t = 1;
	if ( spanAlpha > 0 ) {
		t = Math.min( t, limitAlpha / spanAlpha );
	}
	if ( spanBeta > 0 ) {
		t = Math.min( t, limitBeta / spanBeta );
	}
	if ( t >= 1 - 1e-9 ) {
		const x = Math.max( 0, Math.min( cropRect.x, 1 - W ) );
		const y = Math.max( 0, Math.min( cropRect.y, 1 - H ) );
		if ( x === cropRect.x && y === cropRect.y ) {
			return cropRect;
		}
		return { x, y, width: W, height: H };
	}
	const newW = W * t;
	const newH = H * t;
	const centerX = cropRect.x + W / 2;
	const centerY = cropRect.y + H / 2;
	let newX = centerX - newW / 2;
	let newY = centerY - newH / 2;
	newX = Math.max( 0, Math.min( newX, 1 - newW ) );
	newY = Math.max( 0, Math.min( newY, 1 - newH ) );
	return { x: newX, y: newY, width: newW, height: newH };
}

/**
 * Canonical container used internally by restrictPanZoom.
 * Containment is scale-invariant, so the actual size doesn't matter —
 * only the relative geometry between stencil and image matters.
 */
const CANONICAL_CONTAINER: Size = { width: 1000, height: 1000 };

/**
 * Clamps pan and adjusts zoom so that the zoomed, rotated image fully covers
 * the crop rectangle.
 *
 * Uses the camera matrix to project: builds a camera from the candidate state,
 * maps the stencil corners (axis-aligned in the visual bounding box) to world
 * space via the inverse camera, and checks that all world points lie within
 * [0,1]×[0,1]. If any point is outside, computes the minimal pan correction.
 *
 * @param state     The current cropper state.
 * @param imageSize The natural size of the image in pixels.
 * @param cropRect  The crop rectangle in normalized coordinates.
 * @return The restricted crop pan and zoom values.
 */
export function restrictPanZoom(
	state: CropperState,
	imageSize: Size,
	cropRect: NormalizedRect
): { crop: { x: number; y: number }; zoom: number } {
	const a =
		imageSize.width > 0 && imageSize.height > 0
			? imageSize.width / imageSize.height
			: 1;
	const minZoom = getMinZoomForCover( state.rotation, a, cropRect );
	const zoom = Math.max( state.zoom, minZoom );

	// Build camera with candidate pan and corrected zoom.
	const candidateState = { ...state, zoom };
	const camera = createCamera(
		candidateState,
		CANONICAL_CONTAINER,
		imageSize
	);

	// Build a base camera (zero pan, zoom=1) to get stencil positions.
	// The stencil is positioned in the visual bounding box at zoom=1 —
	// it's anchored in the container and doesn't scale with zoom.
	// CSS zoom only affects the <img> element, not the stencil.
	const baseCamera = createCamera(
		{ ...candidateState, crop: { x: 0, y: 0 }, zoom: 1 },
		CANONICAL_CONTAINER,
		imageSize
	);
	const vb = getVisibleBounds( baseCamera );

	// Stencil corners in screen space (axis-aligned rect within visual bounds).
	const stencilCorners: [ number, number ][] = [
		[ vb.left + cropRect.x * vb.width, vb.top + cropRect.y * vb.height ],
		[
			vb.left + ( cropRect.x + cropRect.width ) * vb.width,
			vb.top + cropRect.y * vb.height,
		],
		[
			vb.left + ( cropRect.x + cropRect.width ) * vb.width,
			vb.top + ( cropRect.y + cropRect.height ) * vb.height,
		],
		[
			vb.left + cropRect.x * vb.width,
			vb.top + ( cropRect.y + cropRect.height ) * vb.height,
		],
	];

	// Map stencil corners to world space via inverse camera.
	// If a world point is outside [0,1], the image doesn't cover that spot.
	const inv = mat2d.create();
	mat2d.invert( inv, camera );

	let minWx = Infinity;
	let maxWx = -Infinity;
	let minWy = Infinity;
	let maxWy = -Infinity;

	for ( const corner of stencilCorners ) {
		const w = vec2.create();
		vec2.transformMat2d( w, corner, inv );
		if ( w[ 0 ] < minWx ) {
			minWx = w[ 0 ];
		}
		if ( w[ 0 ] > maxWx ) {
			maxWx = w[ 0 ];
		}
		if ( w[ 1 ] < minWy ) {
			minWy = w[ 1 ];
		}
		if ( w[ 1 ] > maxWy ) {
			maxWy = w[ 1 ];
		}
	}

	// If all world points are in [0,1], no correction needed.
	if (
		minWx >= -1e-9 &&
		maxWx <= 1 + 1e-9 &&
		minWy >= -1e-9 &&
		maxWy <= 1 + 1e-9
	) {
		if ( zoom === state.zoom ) {
			return { crop: state.crop, zoom };
		}
		return { crop: state.crop, zoom };
	}

	// Compute world-space correction needed.
	// If minWx < 0, we need to shift world points right by |minWx|.
	// If maxWx > 1, we need to shift world points left by (maxWx - 1).
	// If both, we're over-constrained (crop too big) — getMinZoomForCover
	// should have prevented this.
	let dwx = 0;
	let dwy = 0;

	if ( minWx < 0 && maxWx <= 1 + 1e-9 ) {
		dwx = -minWx;
	} else if ( maxWx > 1 && minWx >= -1e-9 ) {
		dwx = 1 - maxWx;
	} else if ( minWx < 0 && maxWx > 1 ) {
		// Over-constrained: center it.
		dwx = ( 1 - maxWx - minWx ) / 2;
	}

	if ( minWy < 0 && maxWy <= 1 + 1e-9 ) {
		dwy = -minWy;
	} else if ( maxWy > 1 && minWy >= -1e-9 ) {
		dwy = 1 - maxWy;
	} else if ( minWy < 0 && maxWy > 1 ) {
		dwy = ( 1 - maxWy - minWy ) / 2;
	}

	// Convert world-space correction to screen-space correction.
	// The camera's 2×2 linear part (indices [0,1,2,3]) maps world deltas
	// to screen deltas: screenDelta = linear * worldDelta.
	const dsx = camera[ 0 ] * dwx + camera[ 2 ] * dwy;
	const dsy = camera[ 1 ] * dwx + camera[ 3 ] * dwy;

	// Convert screen-space correction to pan-field correction.
	// Pan in screen pixels = crop.x * visualW, crop.y * visualH.
	// The correction is subtractive: a positive world shift (dw > 0) means
	// the image needs to move opposite to pan direction, so pan decreases.
	const newCropX = state.crop.x - ( vb.width > 0 ? dsx / vb.width : 0 );
	const newCropY = state.crop.y - ( vb.height > 0 ? dsy / vb.height : 0 );

	return {
		crop: { x: newCropX, y: newCropY },
		zoom,
	};
}

/**
 * Compose a camera matrix for exporting to a canvas.
 *
 * The resulting matrix maps image-pixel coordinates directly to output-canvas
 * coordinates. Apply it with `ctx.setTransform( ...camera )` then
 * `ctx.drawImage( image, 0, 0 )`.
 *
 * The transform chain mirrors the `renderToCanvas` function in canvas-renderer.ts:
 *   translate(visualCenter - cropOffset + outCenter) → rotate → flip+zoom → translate(-imgCenter)
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
	const { rotation, flip, cropRect, zoom, crop } = state;
	if (
		imageSize.width === 0 ||
		imageSize.height === 0 ||
		outputSize.width === 0 ||
		outputSize.height === 0
	) {
		return m;
	}
	const rad = degreesToRadians( rotation );
	const cosR = Math.abs( Math.cos( rad ) );
	const sinR = Math.abs( Math.sin( rad ) );
	const rotW = cosR * imageSize.width + sinR * imageSize.height;
	const rotH = sinR * imageSize.width + cosR * imageSize.height;

	// Scale factor to map the natural crop region to the output canvas size.
	const naturalCropW = cropRect.width * rotW;
	const naturalCropH = cropRect.height * rotH;
	const outputScaleX = naturalCropW > 0 ? outputSize.width / naturalCropW : 1;
	const outputScaleY =
		naturalCropH > 0 ? outputSize.height / naturalCropH : 1;

	const cropOffsetX = cropRect.x * rotW + outputSize.width / 2 / outputScaleX;
	const cropOffsetY =
		cropRect.y * rotH + outputSize.height / 2 / outputScaleY;
	const visualCenterX = rotW / 2 + crop.x * rotW;
	const visualCenterY = rotH / 2 + crop.y * rotH;
	mat2d.scale( m, m, [ outputScaleX, outputScaleY ] );
	mat2d.translate( m, m, [
		visualCenterX - cropOffsetX + outputSize.width / 2 / outputScaleX,
		visualCenterY - cropOffsetY + outputSize.height / 2 / outputScaleY,
	] );
	mat2d.rotate( m, m, degreesToRadians( rotation ) );
	mat2d.scale( m, m, [
		zoom * ( flip.horizontal ? -1 : 1 ),
		zoom * ( flip.vertical ? -1 : 1 ),
	] );
	mat2d.translate( m, m, [ -imageSize.width / 2, -imageSize.height / 2 ] );
	return m;
}
