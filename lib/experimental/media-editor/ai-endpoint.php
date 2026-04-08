<?php
/**
 * REST endpoint for AI-powered image analysis.
 *
 * Provides /wp/v2/media-editor/ai-analyze for the media editor
 * to request AI analysis of images (alt text, crop suggestions,
 * straighten detection).
 *
 * @package gutenberg
 */

add_action( 'rest_api_init', 'gutenberg_media_editor_register_ai_routes' );

/**
 * Register the AI analysis REST route.
 */
function gutenberg_media_editor_register_ai_routes() {
	if ( ! class_exists( '\WordPress\AiClient\AiClient' ) ) {
		return;
	}

	register_rest_route(
		'wp/v2',
		'/media-editor/ai-analyze',
		array(
			'methods'             => 'POST',
			'callback'            => 'gutenberg_media_editor_ai_analyze',
			'permission_callback' => function () {
				return current_user_can( 'upload_files' );
			},
			'args'                => array(
				'image_url' => array(
					'required'          => true,
					'type'              => 'string',
					'sanitize_callback' => 'esc_url_raw',
				),
				'task'      => array(
					'required' => true,
					'type'     => 'string',
					'enum'     => array( 'alt_text', 'smart_crop', 'auto_straighten' ),
				),
			),
		)
	);
}

/**
 * Handle AI analysis requests.
 *
 * @param WP_REST_Request $request The REST request.
 * @return WP_REST_Response|WP_Error
 */
function gutenberg_media_editor_ai_analyze( $request ) {
	$image_url = $request->get_param( 'image_url' );
	$task      = $request->get_param( 'task' );

	// Ensure the AI client keys are loaded.
	if ( function_exists( '_gutenberg_pass_default_connector_keys_to_ai_client' ) ) {
		_gutenberg_pass_default_connector_keys_to_ai_client();
	}

	$registry = \WordPress\AiClient\AiClient::defaultRegistry();

	// Find a text generation client that supports vision.
	$client = null;
	foreach ( array( 'anthropic', 'openai', 'google' ) as $provider_id ) {
		$provider_client = $registry->get_text_generation( $provider_id );
		if ( $provider_client ) {
			$client = $provider_client;
			break;
		}
	}

	if ( ! $client ) {
		return new \WP_Error(
			'no_ai_provider',
			__( 'No AI provider is configured. Add an API key in Settings → Connectors.', 'gutenberg' ),
			array( 'status' => 400 )
		);
	}

	// Build the prompt based on the task.
	switch ( $task ) {
		case 'alt_text':
			$prompt = 'Describe this image in one concise sentence for use as alt text on a website. Return only the description, no quotes or prefix.';
			break;

		case 'smart_crop':
			$prompt = 'Analyze this image and suggest the best crop region to focus on the main subject. Return ONLY a JSON object with these normalized values (0 to 1): {"x": number, "y": number, "width": number, "height": number}. x,y is the top-left corner. No other text.';
			break;

		case 'auto_straighten':
			$prompt = 'Analyze this image and determine if it needs straightening. If the horizon or dominant lines are tilted, return ONLY a JSON object: {"degrees": number} where degrees is the clockwise rotation needed to straighten it (typically -5 to 5). If the image is already straight, return {"degrees": 0}. No other text.';
			break;

		default:
			return new \WP_Error( 'invalid_task', 'Invalid task.', array( 'status' => 400 ) );
	}

	try {
		$response = $client->generate_text(
			$prompt,
			array(
				'image_url' => $image_url,
			)
		);

		return rest_ensure_response(
			array(
				'task'   => $task,
				'result' => $response,
			)
		);
	} catch ( \Exception $e ) {
		return new \WP_Error(
			'ai_error',
			$e->getMessage(),
			array( 'status' => 500 )
		);
	}
}
