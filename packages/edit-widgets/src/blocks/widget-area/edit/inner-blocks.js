/**
 * External dependencies
 */
import classnames from 'classnames';

/**
 * WordPress dependencies
 */
import { useEntityBlockEditor } from '@wordpress/core-data';
import {
	InnerBlocks,
	__experimentalUseInnerBlocksProps,
} from '@wordpress/block-editor';
import { useRef } from '@wordpress/element';

/**
 * Internal dependencies
 */
import useIsDraggingWithin from './use-is-dragging-within';

export default function WidgetAreaInnerBlocks() {
	const [ blocks, onInput, onChange ] = useEntityBlockEditor(
		'root',
		'postType'
	);
	const innerBlocksRef = useRef();
	const isDraggingWithinInnerBlocks = useIsDraggingWithin( innerBlocksRef );
	const shouldHighlightDropZone = isDraggingWithinInnerBlocks;
	// Using the experimental hook so that we can control the className of the element.
	const innerBlocksProps = __experimentalUseInnerBlocksProps(
		{ ref: innerBlocksRef },
		{
			value: blocks,
			onInput,
			onChange,
			templateLock: false,
			renderAppender: InnerBlocks.ButtonBlockAppender,
		}
	);

	return (
		<div
			className={ classnames(
				'wp-block-widget-area__inner-blocks block-editor-inner-blocks editor-styles-wrapper',
				{
					'wp-block-widget-area__highlight-drop-zone': shouldHighlightDropZone,
				}
			) }
		>
			<div { ...innerBlocksProps } />
		</div>
	);
}
