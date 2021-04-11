/**
 * WordPress dependencies
 */
import { __ } from '@wordpress/i18n';
import { getBlockSupport } from '@wordpress/blocks';
/**
 * Internal dependencies
 */
import useEditorFeature from '../components/use-editor-feature';
import { cleanEmptyObject } from './utils';
import { BORDER_SUPPORT_KEY } from './border';
import ColorGradientControl from '../components/colors-gradients/control';
import ContrastChecker from '../components/contrast-checker';

/**
 * Inspector control panel containing the border radius related configuration.
 *
 * @param  {Object} props Block properties.
 * @return {WPElement}    Border radius edit element.
 */
export function BorderColorEdit( props ) {
	const {
		attributes: { style },
		setAttributes,
	} = props;


	const colors = useEditorFeature( 'color.palette' ) || [];

	if ( useIsBorderColorDisabled( props ) ) {
		return null;
	}

	const onChange = ( newColor ) => {
		let newStyle = {
			...style,
			border: {
				...style?.border,
				color: newColor,
			},
		};

		if ( newColor === undefined ) {
			newStyle = cleanEmptyObject( newStyle );
		}

		setAttributes( { style: newStyle } );
	};

	return (
		<>
			<ColorGradientControl
				label={ __( 'Border color' ) }
				colorValue={ style?.border?.color }
				colors={ colors }
				gradients={ [] }
				disableCustomColors={ false }
				disableCustomGradients={ true }
				onColorChange={ onChange }
			/>
		</>
	);
}

/**
 * Determines if there is border color support.
 *
 * @param  {string|Object} blockType Block name or Block Type object.
 * @return {boolean}                 Whether there is support.
 */
export function hasBorderColorSupport( blockType ) {
	const support = getBlockSupport( blockType, BORDER_SUPPORT_KEY );
	return !! ( true === support || support?.color );
}

/**
 * Custom hook that checks if border color settings have been disabled.
 *
 * @param  {string} name The name of the block.
 * @return {boolean}     Whether border radius setting is disabled.
 */
export function useIsBorderColorDisabled( { name: blockName } = {} ) {
	const isDisabled = ! useEditorFeature( 'border.customColor' );
	return ! hasBorderColorSupport( blockName ) || isDisabled;
}
