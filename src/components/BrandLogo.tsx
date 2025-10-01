import React, { useMemo } from 'react';
import {
  Image,
  ImageSourcePropType,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { COLORS } from '../config/theme';
import { useLocalization } from '../contexts/LocalizationContext';

type BrandLogoProps = {
  size?: number;
  orientation?: 'horizontal' | 'vertical';
  style?: StyleProp<ViewStyle>;
  align?: 'left' | 'center' | 'right';
  showText?: boolean;
  logoSource?: ImageSourcePropType;
};

const defaultLogoSource = require('../assets/logo.png');

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 72,
  orientation = 'vertical',
  style,
  align = 'center',
  showText = true,
  logoSource = defaultLogoSource,
}) => {
  const { t } = useLocalization();
  const abbreviation = useMemo(() => t('common.appAbbreviation'), [t]);

  const orientationStyle =
    orientation === 'horizontal' ? styles.horizontal : styles.vertical;
  const groupAlignment =
    align === 'left'
      ? styles.alignLeft
      : align === 'right'
      ? styles.alignRight
      : styles.alignCenter;
  const textAlignment: TextStyle =
    align === 'left'
      ? styles.textAlignLeft
      : align === 'right'
      ? styles.textAlignRight
      : styles.textAlignCenter;

  const imageStyle = [
    styles.logoImage,
    {
      width: size,
      height: size,
    },
  ];

  return (
    <View style={[styles.container, orientationStyle, groupAlignment, style]}>
      <Image
        source={logoSource}
        style={imageStyle}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
      {showText ? (
        <Text style={[styles.logoText, textAlignment]} accessibilityRole="text">
          {abbreviation}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 12,
  },
  vertical: {
    flexDirection: 'column',
  },
  horizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoImage: {
    maxWidth: 160,
    maxHeight: 160,
  },
  logoText: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 4,
    color: COLORS.textPrimary,
  },
  alignLeft: {
    alignItems: 'flex-start',
  },
  alignCenter: {
    alignItems: 'center',
  },
  alignRight: {
    alignItems: 'flex-end',
  },
  textAlignLeft: {
    textAlign: 'left',
  },
  textAlignCenter: {
    textAlign: 'center',
  },
  textAlignRight: {
    textAlign: 'right',
  },
});
