const globalProcess = globalThis.process ?? { env: {} };

globalProcess.env = globalProcess.env ?? {};

if (!globalProcess.env.ONESIGNAL_APP_ID) {
  globalProcess.env.ONESIGNAL_APP_ID = 'test-onesignal-app-id';
}

globalThis.process = globalProcess;
