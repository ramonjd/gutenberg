/**
 * External dependencies
 */
import { expect, test } from '@playwright/test';

/**
 * Internal dependencies
 */
import { gotoStoryId } from '../utils';

test.describe( 'MediaEditor ImageCropper', () => {
	test( 'default crop should render correctly', async ( { page } ) => {
		await gotoStoryId( page, 'mediaeditor-imagecropper--default' );
		await page.waitForSelector( '.wp-media-editor-image-cropper' );
		await expect(
			page.locator( '.wp-media-editor-image-cropper__image' )
		).toBeVisible();
		expect(
			await page.screenshot( { animations: 'disabled' } )
		).toMatchSnapshot();
	} );

	test( 'with controls should render correctly', async ( { page } ) => {
		await gotoStoryId( page, 'mediaeditor-imagecropper--with-controls' );
		await page.waitForSelector( '.wp-media-editor-image-cropper' );
		await expect(
			page.locator( '.wp-media-editor-image-cropper__image' )
		).toBeVisible();
		expect(
			await page.screenshot( { animations: 'disabled' } )
		).toMatchSnapshot();
	} );
} );
