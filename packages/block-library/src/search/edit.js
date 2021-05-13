/**
 * External dependencies
 */
import classnames from 'classnames';

/**
 * WordPress dependencies
 */
import {
	useBlockProps,
	BlockControls,
	InspectorControls,
	RichText,
	__experimentalUseBorderProps as useBorderProps,
	__experimentalUnitControl as UnitControl,
} from '@wordpress/block-editor';
import {
	DropdownMenu,
	MenuGroup,
	MenuItem,
	ToolbarGroup,
	Button,
	ButtonGroup,
	ToolbarButton,
	ResizableBox,
	PanelBody,
	BaseControl,
	__experimentalUseCustomUnits as useCustomUnits,
} from '@wordpress/components';
import { useInstanceId } from '@wordpress/compose';
import { search } from '@wordpress/icons';
import { __ } from '@wordpress/i18n';

/**
 * Internal dependencies
 */
import {
	buttonOnly,
	buttonOutside,
	buttonInside,
	noButton,
	buttonWithIcon,
	toggleLabel,
} from './icons';
import {
	PC_WIDTH_DEFAULT,
	PX_WIDTH_DEFAULT,
	MIN_WIDTH,
	MIN_WIDTH_UNIT,
} from './utils.js';

// Used to calculate border radius adjustment to avoid "fat" corners when
// button is placed inside wrapper.
const DEFAULT_INNER_PADDING = '4px';

export default function SearchEdit( {
	className,
	attributes,
	setAttributes,
	toggleSelection,
	isSelected,
} ) {
	const {
		label,
		showLabel,
		placeholder,
		width,
		widthUnit,
		align,
		buttonText,
		buttonPosition,
		buttonUseIcon,
		style,
	} = attributes;

	const borderRadius = style?.border?.radius;
	const borderColor = style?.border?.color;
	const borderProps = useBorderProps( attributes );

	// Check for old deprecated numerical border radius. Done as a separate
	// check so that a borderRadius style won't overwrite the longhand
	// per-corner styles.
	if ( typeof borderRadius === 'number' ) {
		borderProps.style.borderRadius = `${ borderRadius }px`;
	}

	const unitControlInstanceId = useInstanceId( UnitControl );
	const unitControlInputId = `wp-block-search__width-${ unitControlInstanceId }`;
	const isButtonPositionInside = 'button-inside' === buttonPosition;

	const units = useCustomUnits( {
		availableUnits: [ '%', 'px' ],
		defaultValues: { '%': PC_WIDTH_DEFAULT, px: PX_WIDTH_DEFAULT },
	} );

	const getBlockClassNames = () => {
		return classnames(
			className,
			! isButtonPositionInside ? borderProps.className : undefined,
			isButtonPositionInside
				? 'wp-block-search__button-inside'
				: undefined,
			'button-outside' === buttonPosition
				? 'wp-block-search__button-outside'
				: undefined,
			'no-button' === buttonPosition
				? 'wp-block-search__no-button'
				: undefined,
			'button-only' === buttonPosition
				? 'wp-block-search__button-only'
				: undefined,
			! buttonUseIcon && 'no-button' !== buttonPosition
				? 'wp-block-search__text-button'
				: undefined,
			buttonUseIcon && 'no-button' !== buttonPosition
				? 'wp-block-search__icon-button'
				: undefined
		);
	};

	const getButtonPositionIcon = () => {
		switch ( buttonPosition ) {
			case 'button-inside':
				return buttonInside;
			case 'button-outside':
				return buttonOutside;
			case 'no-button':
				return noButton;
			case 'button-only':
				return buttonOnly;
		}
	};

	const getResizableSides = () => {
		if ( 'button-only' === buttonPosition ) {
			return {};
		}

		return {
			right: align === 'right' ? false : true,
			left: align === 'right' ? true : false,
		};
	};

	const renderTextField = () => {
		const textFieldClasses = classnames(
			'wp-block-search__input',
			! isButtonPositionInside ? borderProps.className : undefined
		);
		// If the button is inside the wrapper, the wrapper gets the border styles, not the input control.
		const textFieldStyles = {
			borderRadius: ! isButtonPositionInside ? borderRadius : undefined,
			borderColor: ! isButtonPositionInside ? borderColor : undefined,
		};
		return (
			<input
				className={ textFieldClasses }
				style={ textFieldStyles }
				aria-label={ __( 'Optional placeholder text' ) }
				// We hide the placeholder field's placeholder when there is a value. This
				// stops screen readers from reading the placeholder field's placeholder
				// which is confusing.
				placeholder={
					placeholder ? undefined : __( 'Optional placeholder…' )
				}
				value={ placeholder }
				onChange={ ( event ) =>
					setAttributes( { placeholder: event.target.value } )
				}
			/>
		);
	};

	const renderButton = () => {
		const buttonClasses = classnames(
			'wp-block-search__button',
			borderProps.className
		);
		return (
			<>
				{ buttonUseIcon && (
					<Button
						icon={ search }
						className={ buttonClasses }
						style={ { borderRadius, borderColor } }
					/>
				) }

				{ ! buttonUseIcon && (
					<RichText
						className={ buttonClasses }
						style={ { borderRadius, borderColor } }
						aria-label={ __( 'Button text' ) }
						placeholder={ __( 'Add button text…' ) }
						withoutInteractiveFormatting
						value={ buttonText }
						onChange={ ( html ) =>
							setAttributes( { buttonText: html } )
						}
					/>
				) }
			</>
		);
	};

	const controls = (
		<>
			<BlockControls>
				<ToolbarGroup>
					<ToolbarButton
						title={ __( 'Toggle search label' ) }
						icon={ toggleLabel }
						onClick={ () => {
							setAttributes( {
								showLabel: ! showLabel,
							} );
						} }
						className={ showLabel ? 'is-pressed' : undefined }
					/>
					<DropdownMenu
						icon={ getButtonPositionIcon() }
						label={ __( 'Change button position' ) }
					>
						{ ( { onClose } ) => (
							<MenuGroup className="wp-block-search__button-position-menu">
								<MenuItem
									icon={ noButton }
									onClick={ () => {
										setAttributes( {
											buttonPosition: 'no-button',
										} );
										onClose();
									} }
								>
									{ __( 'No Button' ) }
								</MenuItem>
								<MenuItem
									icon={ buttonOutside }
									onClick={ () => {
										setAttributes( {
											buttonPosition: 'button-outside',
										} );
										onClose();
									} }
								>
									{ __( 'Button Outside' ) }
								</MenuItem>
								<MenuItem
									icon={ buttonInside }
									onClick={ () => {
										setAttributes( {
											buttonPosition: 'button-inside',
										} );
										onClose();
									} }
								>
									{ __( 'Button Inside' ) }
								</MenuItem>
							</MenuGroup>
						) }
					</DropdownMenu>

					{ 'no-button' !== buttonPosition && (
						<ToolbarButton
							title={ __( 'Use button with icon' ) }
							icon={ buttonWithIcon }
							onClick={ () => {
								setAttributes( {
									buttonUseIcon: ! buttonUseIcon,
								} );
							} }
							className={
								buttonUseIcon ? 'is-pressed' : undefined
							}
						/>
					) }
				</ToolbarGroup>
			</BlockControls>

			<InspectorControls>
				<PanelBody title={ __( 'Display Settings' ) }>
					<BaseControl
						label={ __( 'Width' ) }
						id={ unitControlInputId }
					>
						<UnitControl
							id={ unitControlInputId }
							min={ `${ MIN_WIDTH }${ MIN_WIDTH_UNIT }` }
							onChange={ ( newWidth ) => {
								const filteredWidth =
									widthUnit === '%' &&
									parseInt( newWidth, 10 ) > 100
										? 100
										: newWidth;

								setAttributes( {
									width: parseInt( filteredWidth, 10 ),
								} );
							} }
							onUnitChange={ ( newUnit ) => {
								setAttributes( {
									width:
										'%' === newUnit
											? PC_WIDTH_DEFAULT
											: PX_WIDTH_DEFAULT,
									widthUnit: newUnit,
								} );
							} }
							style={ { maxWidth: 80 } }
							value={ `${ width }${ widthUnit }` }
							unit={ widthUnit }
							units={ units }
						/>

						<ButtonGroup
							className="wp-block-search__components-button-group"
							aria-label={ __( 'Percentage Width' ) }
						>
							{ [ 25, 50, 75, 100 ].map( ( widthValue ) => {
								return (
									<Button
										key={ widthValue }
										isSmall
										variant={
											`${ widthValue }%` ===
											`${ width }${ widthUnit }`
												? 'primary'
												: undefined
										}
										onClick={ () =>
											setAttributes( {
												width: widthValue,
												widthUnit: '%',
											} )
										}
									>
										{ widthValue }%
									</Button>
								);
							} ) }
						</ButtonGroup>
					</BaseControl>
				</PanelBody>
			</InspectorControls>
		</>
	);

	const padBorderRadius = ( radius ) =>
		radius ? `calc(${ radius } + ${ DEFAULT_INNER_PADDING })` : undefined;

	const getWrapperStyles = () => {
		const styles = {
			borderColor,
		};

		const isNonZeroBorderRadius = parseInt( borderRadius, 10 ) !== 0;

		if ( 'button-inside' === buttonPosition && isNonZeroBorderRadius ) {
			// We have button inside wrapper and a border radius value to apply.
			// Add default padding so we don't get "fat" corners.
			//
			// CSS calc() is used here to support non-pixel units. The inline
			// style using calc() will only apply if both values have units.

			if ( typeof borderRadius === 'object' ) {
				// Individual corner border radii present.
				const {
					topLeft,
					topRight,
					bottomLeft,
					bottomRight,
				} = borderRadius;

				return {
					borderTopLeftRadius: padBorderRadius( topLeft ),
					borderTopRightRadius: padBorderRadius( topRight ),
					borderBottomLeftRadius: padBorderRadius( bottomLeft ),
					borderBottomRightRadius: padBorderRadius( bottomRight ),
					...styles,
				};
			}

			// The inline style using calc() will only apply if both values
			// supplied to calc() have units. Deprecated block's may have
			// unitless integer.
			const radius = Number.isInteger( borderRadius )
				? `${ borderRadius }px`
				: borderRadius;

			styles.borderRadius = `calc(${ radius } + ${ DEFAULT_INNER_PADDING })`;
		}

		return styles;
	};

	const blockProps = useBlockProps( {
		className: getBlockClassNames(),
	} );

	return (
		<div { ...blockProps }>
			{ controls }

			{ showLabel && (
				<RichText
					className="wp-block-search__label"
					aria-label={ __( 'Label text' ) }
					placeholder={ __( 'Add label…' ) }
					withoutInteractiveFormatting
					value={ label }
					onChange={ ( html ) => setAttributes( { label: html } ) }
				/>
			) }

			<ResizableBox
				size={ {
					width: `${ width }${ widthUnit }`,
				} }
				className={ classnames(
					'wp-block-search__inside-wrapper',
					isButtonPositionInside ? borderProps.className : undefined
				) }
				style={ getWrapperStyles() }
				minWidth={ MIN_WIDTH }
				enable={ getResizableSides() }
				onResizeStart={ ( event, direction, elt ) => {
					setAttributes( {
						width: parseInt( elt.offsetWidth, 10 ),
						widthUnit: 'px',
					} );
					toggleSelection( false );
				} }
				onResizeStop={ ( event, direction, elt, delta ) => {
					setAttributes( {
						width: parseInt( width + delta.width, 10 ),
					} );
					toggleSelection( true );
				} }
				showHandle={ isSelected }
			>
				{ ( isButtonPositionInside ||
					'button-outside' === buttonPosition ) && (
					<>
						{ renderTextField() }
						{ renderButton() }
					</>
				) }

				{ 'button-only' === buttonPosition && renderButton() }
				{ 'no-button' === buttonPosition && renderTextField() }
			</ResizableBox>
		</div>
	);
}
