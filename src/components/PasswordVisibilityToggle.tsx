import React from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { COLORS } from '../config/theme';

interface PasswordVisibilityToggleProps {
  visible: boolean;
  onToggle: () => void;
  labelShow: string;
  labelHide: string;
  style?: StyleProp<ViewStyle>;
}

export const PasswordVisibilityToggle: React.FC<
  PasswordVisibilityToggleProps
> = ({ visible, onToggle, labelShow, labelHide, style }) => {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={visible ? labelHide : labelShow}
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        style,
        pressed ? styles.buttonPressed : null,
      ]}
    >
      <View style={styles.iconContainer}>
        <View style={styles.eyeOutline} />
        <View
          style={[styles.pupil, visible ? styles.pupilVisible : styles.pupilDim]}
        />
        {!visible ? <View style={styles.slash} /> : null}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  iconContainer: {
    width: 24,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeOutline: {
    position: 'absolute',
    width: 20,
    height: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    transform: [{ scaleX: 1.1 }],
  },
  pupil: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pupilVisible: {
    backgroundColor: COLORS.primary,
  },
  pupilDim: {
    backgroundColor: COLORS.primary,
    opacity: 0.4,
  },
  slash: {
    position: 'absolute',
    width: 22,
    height: 2,
    borderRadius: 1,
    backgroundColor: COLORS.primary,
    transform: [{ rotate: '-30deg' }],
  },
});
