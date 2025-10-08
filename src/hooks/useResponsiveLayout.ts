import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

export type ResponsiveLayout = {
  width: number;
  height: number;
  shortestSide: number;
  isLandscape: boolean;
  isSmallPhone: boolean;
  isTablet: boolean;
  isLargeTablet: boolean;
  contentPadding: number;
  maxContentWidth?: number;
};

export const useResponsiveLayout = (): ResponsiveLayout => {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const shortestSide = Math.min(width, height);
    const isLandscape = width > height;
    const isTablet = width >= 768;
    const isLargeTablet = width >= 1024;
    const isSmallPhone = shortestSide < 360;

    const contentPadding = isLargeTablet
      ? 40
      : isTablet
      ? 32
      : isSmallPhone
      ? 16
      : 24;

    const maxContentWidth = isLargeTablet ? 900 : isTablet ? 720 : undefined;

    return {
      width,
      height,
      shortestSide,
      isLandscape,
      isSmallPhone,
      isTablet,
      isLargeTablet,
      contentPadding,
      maxContentWidth,
    };
  }, [height, width]);
};
