/**
 * External dependencies
 */
import classnames from 'classnames';

/**
 * WordPress dependencies
 */
import { __ } from '@wordpress/i18n';
import {
	BlockControls,
	InspectorControls,
	RichText,
	useBlockProps,
	__experimentalUseInnerBlocksProps as useInnerBlocksProps,
} from '@wordpress/block-editor';
import { useSelect, useDispatch } from '@wordpress/data';
import { close as closeIcon } from '@wordpress/icons';
import { ToolbarButton, ToolbarGroup } from '@wordpress/components';
import { useState } from '@wordpress/element';
// import { store as editPostStore } from '@wordpress/edit-post';

// import { store as editPostStore } from '../../store';

export default function OverlayEdit( {
	attributes,
	isSelected,
	setAttributes,
} ) {
	const { isInserterOpened, isEditorSidebarOpened } = useSelect(
		( select ) => {
			const isBlockInserterOpened = select(
				'core/edit-post'
			).isInserterOpened();
			const isBlockEditorSidebarOpened = select(
				'core/edit-post'
			).isEditorSidebarOpened();
			return {
				isInserterOpened: isBlockInserterOpened,
				isEditorSidebarOpened: isBlockEditorSidebarOpened,
			};
		}
	);

	const [ overlayContext, setOverlayContext ] = useState( 'button' );
	const blockProps = useBlockProps( {
		className: classnames( {
			'wp-block-overlay--sidebar-opened': isEditorSidebarOpened,
			'wp-block-overlay--inserter-opened': isInserterOpened,
		} ),
	} );

	const { overlayButtonContent } = attributes;

	const innerClasses = classnames( 'wp-block-overlay__content', {
		'wp-block-overlay__content--show': overlayContext === 'overlay',
	} );

	const innerBlocksProps = useInnerBlocksProps(
		{ className: innerClasses },
		{
			orientation: 'vertical',
			placeholder: isSelected ? (
				<p>{ __( 'Click plus to add' ) }</p>
			) : (
				<p>{ __( 'Content.' ) }</p>
			),
			__experimentalLayout: {
				type: 'default',
				alignments: [],
			},
		}
	);
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
			<div { ...blockProps }>
				<div className="wp-block-overlay__button">
					<RichText
						tagName="div"
						aria-label={ __( 'Overlay button' ) }
						placeholder={ __( 'Add button text' ) }
						value={ overlayButtonContent }
						onChange={ ( value ) =>
							setAttributes( { overlayButtonContent: value } )
						}
						withoutInteractiveFormatting
					/>
				</div>
				<div { ...innerBlocksProps }></div>
			</div>
		</>
	);
}
