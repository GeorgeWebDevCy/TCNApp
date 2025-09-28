const listeners = {
  foregroundWillDisplay: new Set(),
  click: new Set(),
  permissionChange: new Set(),
};

const OneSignal = {
  initialize: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  Debug: {
    setLogLevel: jest.fn(),
    setAlertLevel: jest.fn(),
  },
  Notifications: {
    addEventListener: jest.fn((event, listener) => {
      const registry = listeners[event];
      if (registry) {
        registry.add(listener);
      }
    }),
    removeEventListener: jest.fn((event, listener) => {
      const registry = listeners[event];
      if (registry) {
        registry.delete(listener);
      }
    }),
    requestPermission: jest.fn(),
  },
  User: {
    addTags: jest.fn(),
    setLanguage: jest.fn(),
  },
};

const LogLevel = { None: 0, Fatal: 1, Error: 2, Warn: 3, Info: 4, Debug: 5, Verbose: 6 };

module.exports = {
  LogLevel,
  OneSignal,
  __listeners: listeners,
};
