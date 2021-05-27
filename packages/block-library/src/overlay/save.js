/**
 * WordPress dependencies
 */
import { InnerBlocks, RichText, useBlockProps } from '@wordpress/block-editor';
import { Overlay } from '@wordpress/components';

export default function save( { attributes } ) {
	const { overlayButtonContent } = attributes;
	return (
		<div { ...useBlockProps.save() }>
			<RichText.Content tagName="a" value={ overlayButtonContent } />
			<Overlay>
				<InnerBlocks.Content />
			</Overlay>
		</div>
	);
}
