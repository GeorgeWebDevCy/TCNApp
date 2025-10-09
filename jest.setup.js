const globalProcess = globalThis.process ?? { env: {} };

globalProcess.env = globalProcess.env ?? {};

if (!globalProcess.env.ONESIGNAL_APP_ID) {
  globalProcess.env.ONESIGNAL_APP_ID = 'test-onesignal-app-id';
}

globalThis.process = globalProcess;

jest.mock('react-native-qrcode-svg', () => 'QRCodeSVG');

jest.mock('react-native-camera', () => {
  const React = require('react');
  const MockCamera = ({ children }) => React.createElement('mock-camera', null, children);
  MockCamera.Constants = { BarCodeType: { qr: 'qr' } };
  return { RNCamera: MockCamera };
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
