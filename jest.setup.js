jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const globalProcess = globalThis.process ?? { env: {} };

globalProcess.env = globalProcess.env ?? {};

if (!globalProcess.env.ONESIGNAL_APP_ID) {
  globalProcess.env.ONESIGNAL_APP_ID = 'test-onesignal-app-id';
}

globalThis.process = globalProcess;

jest.mock('react-native-qrcode-svg', () => 'QRCodeSVG');

jest.mock('react-native-camera-kit', () => {
  const React = require('react');
  return {
    CameraScreen: ({ children, ...props }) =>
      React.createElement('camera-screen', props, children),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const createElement = React.createElement;
  return {
    SafeAreaView: ({ children, ...rest }) =>
      createElement('safe-area-view', rest, children),
    SafeAreaProvider: ({ children }) => createElement('safe-area-provider', null, children),
    SafeAreaConsumer: ({ children }) => children({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    }),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    initialWindowMetrics: {
      insets: { top: 0, bottom: 0, left: 0, right: 0 },
      frame: { x: 0, y: 0, width: 0, height: 0 },
    },
  };
});

jest.mock('react-native-svg', () => {
  const React = require('react');
  const Mock = ({ children }) => React.createElement('svg', null, children);
  return {
    __esModule: true,
    default: Mock,
    Svg: Mock,
    Circle: 'SvgCircle',
    Rect: 'SvgRect',
    Path: 'SvgPath',
    G: 'SvgGroup',
    Text: 'SvgText',
    TSpan: 'SvgTSpan',
    Defs: 'SvgDefs',
    Stop: 'SvgStop',
    LinearGradient: 'SvgLinearGradient',
  };
});

