import type * as React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

declare module 'react-native-camera-kit' {
  export type CameraScreenProps = {
    style?: StyleProp<ViewStyle>;
    cameraType?: 'front' | 'back';
    scanBarcode?: boolean;
    showFrame?: boolean;
    hideControls?: boolean;
    onReadCode?: (event: unknown) => void;
  };

  export const CameraScreen: React.ComponentType<CameraScreenProps>;
}
