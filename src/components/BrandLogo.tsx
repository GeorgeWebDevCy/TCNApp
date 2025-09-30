import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ViewStyle,
  StyleProp,
  TextStyle,
} from 'react-native';
import { COLORS } from '../config/theme';
import { useLocalization } from '../contexts/LocalizationContext';

type BrandLogoProps = {
  size?: number;
  orientation?: 'horizontal' | 'vertical';
  style?: StyleProp<ViewStyle>;
  align?: 'left' | 'center' | 'right';
  showName?: boolean;
  showAbbreviationLabel?: boolean;
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 64,
  orientation = 'vertical',
  style,
  align = 'center',
  showName = true,
  showAbbreviationLabel = true,
}) => {
  const { t } = useLocalization();
  const abbreviation = t('common.appAbbreviation');
  const brandName = t('common.appName');
  const brandTagline = t('common.appTagline', {
    replace: { abbreviation },
  });
  const containerStyles = [
    styles.container,
    orientation === 'horizontal' ? styles.horizontal : styles.vertical,
    style,
  ];

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

  const circleStyle = [
    styles.logoMark,
    {
      width: size,
      height: size,
      borderRadius: size / 2,
    },
  ];

  const abbreviationFontSize = Math.max(18, size * 0.38);

  return (
    <View style={containerStyles} accessibilityRole="header">
      <View style={circleStyle}>
        <Text style={[styles.logoMarkText, { fontSize: abbreviationFontSize }]}>
          {abbreviation}
        </Text>
      </View>
      {(showName || showAbbreviationLabel) && (
        <View style={[styles.textGroup, groupAlignment]}>
          {showName ? (
            <Text
              style={[styles.brandName, textAlignment]}
              accessibilityRole="text"
            >
              {brandName}
            </Text>
          ) : null}
          {showAbbreviationLabel ? (
            <Text
              style={[styles.brandTagline, textAlignment]}
              accessibilityRole="text"
            >
              {brandTagline}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 12,
  },
  vertical: {
    alignSelf: 'center',
  },
  horizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  logoMark: {
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00000033',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 8,
    elevation: 3,
    paddingHorizontal: 12,
  },
  logoMarkText: {
    color: COLORS.textOnPrimary,
    fontWeight: '700',
    letterSpacing: 2,
  },
  textGroup: {
    gap: 4,
  },
  brandName: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  brandTagline: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textAlign: 'center',
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
