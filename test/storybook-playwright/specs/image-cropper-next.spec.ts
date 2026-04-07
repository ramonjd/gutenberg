/**
 * External dependencies
 */
import { expect, test } from '@playwright/test';

/**
 * Internal dependencies
 */
import { gotoStoryId } from '../utils';

test.describe( 'ImageCropperNext', () => {
	test( 'default crop should render correctly', async ( { page } ) => {
		await gotoStoryId( page, 'imagecroppernext-rectanglecrop--default' );
		await page.waitForSelector( '.wp-image-cropper-next' );
		await expect(
			page.locator( '.wp-image-cropper-next__image' )
		).toBeVisible();
		expect(
			await page.screenshot( { animations: 'disabled' } )
		).toMatchSnapshot();
	} );

	test( 'with controls should render correctly', async ( { page } ) => {
		await gotoStoryId(
			page,
			'imagecroppernext-rectanglecrop--with-controls'
		);
		await page.waitForSelector( '.wp-image-cropper-next' );
		await expect(
			page.locator( '.wp-image-cropper-next__image' )
		).toBeVisible();
		expect(
			await page.screenshot( { animations: 'disabled' } )
		).toMatchSnapshot();
	} );
} );
