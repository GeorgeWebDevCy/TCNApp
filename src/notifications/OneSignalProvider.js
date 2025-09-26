import React, {useEffect} from 'react';
import OneSignal from 'react-native-onesignal';

const ONESIGNAL_APP_ID = 'REPLACE_WITH_YOUR_ONESIGNAL_APP_ID';

const OneSignalProvider = ({children}) => {
  useEffect(() => {
    if (!ONESIGNAL_APP_ID || ONESIGNAL_APP_ID === 'REPLACE_WITH_YOUR_ONESIGNAL_APP_ID') {
      console.warn(
        'OneSignalProvider: Update ONESIGNAL_APP_ID with your OneSignal application ID before shipping.',
      );
    }

    OneSignal.initialize(ONESIGNAL_APP_ID);

    OneSignal.Notifications.requestPermission(true);

    const onForeground = event => {
      const {notification} = event;
      event.complete(notification);
    };

    OneSignal.Notifications.addEventListener('foregroundWillDisplay', onForeground);

    return () => {
      OneSignal.Notifications.removeEventListener('foregroundWillDisplay', onForeground);
    };
  }, []);

  return <>{children}</>;
};

export default OneSignalProvider;
