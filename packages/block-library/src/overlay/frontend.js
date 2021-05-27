/**
 * WordPress dependencies
 */
import { __, isRTL } from '@wordpress/i18n';
import { ESCAPE } from '@wordpress/keycodes';

const overlayContainer = document.querySelector( '.wp-block-overlay' );

function closeOverlay() {
	document.querySelector( '.wp-block-overlay' ).classList.remove( 'is-displayed' );
}

function handleEscapeKeyDown( event ) {
	if ( event.keyCode === ESCAPE ) {
		event.stopPropagation();
		closeOverlay();
	}
}
