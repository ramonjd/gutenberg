/**
 * WordPress dependencies
 */
import { InnerBlocks, RichText, useBlockProps } from '@wordpress/block-editor';

export default function save( { attributes } ) {
	const { overlayButtonContent } = attributes;
	return (
		<div { ...useBlockProps.save() }>
			<div className="wp-block-overlay__button">
				<RichText.Content
					tagName="div"
					value={ overlayButtonContent }
				/>
			</div>
			<div className="wp-block-overlay__content">
				<div className="wp-block-overlay__close-button">x</div>
				<InnerBlocks.Content />
			</div>
		</div>
	);
}
