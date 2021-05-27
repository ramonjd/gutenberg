<?php
/**
 * Server-side rendering of the `core/overlay` block.
 *
 * @package gutenberg
 */

/**
 * Renders the `core/overlay` block on server.
 *
 * @param array $attributes The block attributes.
 * @param array $content The saved content.
 * @param array $block The parsed block.
 *
 * @return string Returns the post content with the legacy widget added.
 */
function render_block_core_overlay( $attributes, $content, $block ) {
	wp_enqueue_script(
		'core_block_overlay_load_frontend_scripts',
		plugins_url( 'frontend.js', __DIR__ . '/overlay/frontend.js' ),
		array(),
		false,
		true
	);
	$inner_blocks_html = '';
	foreach ( $block->inner_blocks as $inner_block ) {
		$inner_blocks_html .= $inner_block->render();
	}

	$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'is-displayed' ) );;
	return sprintf(
	'<div %3$s>
				<div class="wp-block-overlay__wrapper">
					<div class="wp-block-overlay__header">
						<button aria-label="%2$s" class="wp-block-overlay__close-button">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" role="img" aria-hidden="true"><path d="M13 11.8l6.1-6.3-1-1-6.1 6.2-6.1-6.2-1 1 6.1 6.3-6.5 6.7 1 1 6.5-6.6 6.5 6.6 1-1z"></path></svg>
						</button>
					</div>
					<div class="wp-block-overlay__content">%1$s</div>
				</div>
			</div>',
			$inner_blocks_html,
			__( 'Close' ), // Close button label.
			$wrapper_attributes
	);
}

/**
 * Register the navigation block.
 *
 * @uses render_block_core_overlay()
 * @throws WP_Error An WP_Error exception parsing the block definition.
 */
function register_block_core_overlay() {
	register_block_type_from_metadata(
		__DIR__ . '/overlay',
		array(
			'render_callback' => 'render_block_core_overlay',
		)
	);
}

add_action( 'init', 'register_block_core_overlay' );
