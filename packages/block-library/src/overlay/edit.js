/**
 * External dependencies
 */
import classnames from 'classnames';

/**
 * WordPress dependencies
 */
import { __, isRTL } from '@wordpress/i18n';
import {
	BlockControls,
	InspectorControls,
	RichText,
	useBlockProps,
	__experimentalUseInnerBlocksProps as useInnerBlocksProps,
} from '@wordpress/block-editor';
import { useSelect, useDispatch } from '@wordpress/data';
import { Icon, close } from '@wordpress/icons';
import { Button, ToolbarButton, ToolbarGroup } from '@wordpress/components';
import { useState } from '@wordpress/element';
import { fullscreen } from '@wordpress/icons';
/**
 * Internal dependencies
 */


/*

	TODO:
		- make the trigger element a a/button give the user a choice
		- apply styles to content (overlay) only
		- provide a preview in the editor
		- Use react portal for the overlay
		- options of show/hide animation effects?
 */

export default function OverlayEdit( {
	attributes,
	isSelected,
	setAttributes,
} ) {
	const {
		isFixedToolbarFeatureActive,
		isAdminSidebarOpen,
		isInserterOpen,
		isEditorSidebarOpen,
	} = useSelect( ( select ) => {
		const isBlockInserterOpen = select(
			'core/edit-post'
		).isInserterOpened();
		const isBlockEditorSidebarOpen = select(
			'core/edit-post'
		).isEditorSidebarOpened();

		return {
			// packages/edit-post/src/components/header/writing-menu/index.js
			isFixedToolbarFeatureActive: select( 'core/edit-post' ).isFeatureActive(
				'fixedToolbar'
			),
			isAdminSidebarOpen: ! select( 'core/edit-post' ).isFeatureActive(
				'fullscreenMode'
			),
			isInserterOpen: isBlockInserterOpen,
			isEditorSidebarOpen: isBlockEditorSidebarOpen,
		};
	} );
	const [ overlayContext, setOverlayContext ] = useState( 'button' );
	const blockClasses = classnames( 'wp-block-overlay__overlay', {
		'is-admin-sidebar-open': isAdminSidebarOpen,
		'is-fixed-toolbar-active': isFixedToolbarFeatureActive,
		'is-sidebar-open': isEditorSidebarOpen,
		'is-inserter-open': isInserterOpen,
		'wp-block-overlay__content--show': overlayContext === 'overlay',
	} );


	const innerBlocksProps = useInnerBlocksProps(
		{},
		{
			orientation: 'vertical',
			__experimentalLayout: {
				type: 'default',
				alignments: [],
			},
		}
	);

	const closeEditScreen = () => {
		setOverlayContext( 'button' );
	};

	const openEditScreen = () => {
		setOverlayContext( 'overlay' );
	};

	return (
		<>
			<BlockControls>
				<ToolbarGroup>
					<ToolbarButton
						onClick={ () => setOverlayContext( 'button' ) }
					>
						{ __( 'Button' ) }
					</ToolbarButton>
					<ToolbarButton
						onClick={ () => setOverlayContext( 'overlay' ) }
					>
						{ __( 'Overlay' ) }
					</ToolbarButton>
				</ToolbarGroup>
			</BlockControls>
			<div { ...useBlockProps() }>
				<button onClick={ openEditScreen }>
					<Icon
						className="components-overlay__icon"
						icon={ fullscreen }
						size={ 24 }
					/>
					Overlay Block (click to edit)
				</button>
				<div className={ blockClasses }>
					<div className="wp-block-overlay__wrapper">
						<div className="wp-block-overlay__header">
							<button className="wp-block-overlay__close-button">
								<Icon
									className="cwp-block-overlay__icon"
									icon={ close }
									size={ 24 }
									onClick={ closeEditScreen }
								/>
							</button>
						</div>
						<div className="wp-block-overlay__content">
							<div { ...innerBlocksProps } />
						</div>
					</div>
				</div>
			</div>
		</>
	);
}
