const listeners: Record<string, Set<(...args: any[]) => void>> = {};

const addEventListener = (event: string, handler: (...args: any[]) => void) => {
  if (!listeners[event]) {
    listeners[event] = new Set();
  }
  listeners[event].add(handler);
  return {
    remove: () => listeners[event]?.delete(handler),
  };
};

const emit = (event: string, payload?: unknown) => {
  listeners[event]?.forEach((handler) => {
    handler(payload);
  });
};

class MockNotificationWillDisplayEvent {
  notification: Record<string, unknown>;

  constructor(notification: Record<string, unknown>) {
    this.notification = notification;
  }

  preventDefault() {}

  getNotification() {
    return this.notification;
  }
}

const OneSignal = {
  initialize: jest.fn(),
  Debug: {
    setLogLevel: jest.fn(),
  },
  Notifications: {
    requestPermission: jest.fn(),
    addEventListener: jest.fn(addEventListener),
    __emit: emit,
  },
  User: {
    addTag: jest.fn().mockResolvedValue(undefined),
    addTags: jest.fn().mockResolvedValue(undefined),
    removeTag: jest.fn().mockResolvedValue(undefined),
    setLanguage: jest.fn(),
    pushSubscription: {
      optIn: jest.fn(),
      optOut: jest.fn(),
    },
  },
  __emitter: {
    emit,
    listeners,
    reset: () => {
      Object.keys(listeners).forEach((key) => listeners[key]?.clear());
    },
  },
};

export type NotificationClickEvent = {
  notification: Record<string, unknown>;
};

export { MockNotificationWillDisplayEvent as NotificationWillDisplayEvent };

export default OneSignal;
