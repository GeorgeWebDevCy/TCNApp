import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import deviceLog, { LogView } from './src/utils/deviceLog';
import { AuthProvider, useAuthContext } from './src/contexts/AuthContext';
import { LocalizationProvider } from './src/contexts/LocalizationContext';
import { OneSignalProvider } from './src/notifications/OneSignalProvider';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';

const AppContent: React.FC = () => {
  const {
    state: { isAuthenticated, isLoading },
  } = useAuthContext();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return isAuthenticated ? <HomeScreen /> : <LoginScreen />;
};

function App(): JSX.Element {
  const [areLogsVisible, setAreLogsVisible] = useState(false);

  useEffect(() => {
    deviceLog
      .init(AsyncStorage, {
        logToConsole: true,
        logRNErrors: true,
        maxNumberToRender: 1000,
        maxNumberToPersist: 1000,
      })
      .then(() => {
        deviceLog.info('Device log initialized');
      })
      .catch((error) => {
        console.warn('Failed to initialize device log', error);
      });
  }, []);

  return (
    <LocalizationProvider>
      <SafeAreaProvider>
        <AuthProvider>
          <OneSignalProvider>
            <View style={styles.appContainer}>
              <AppContent />
              {!areLogsVisible && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Show device logs"
                  style={styles.logToggle}
                  onPress={() => setAreLogsVisible(true)}
                >
                  <Text style={styles.logToggleText}>Show Logs</Text>
                </TouchableOpacity>
              )}
              {areLogsVisible && (
                <View style={styles.logOverlay}>
                  <View style={styles.logOverlayHeader}>
                    <Text style={styles.logOverlayTitle}>Device Logs</Text>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Hide device logs"
                      onPress={() => setAreLogsVisible(false)}
                      style={styles.logOverlayClose}
                    >
                      <Text style={styles.logOverlayCloseText}>Close</Text>
                    </TouchableOpacity>
                  </View>
                  <LogView
                    style={styles.logView}
                    multiExpanded
                    timeStampFormat="HH:mm:ss"
                  />
                </View>
              )}
            </View>
          </OneSignalProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </LocalizationProvider>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  logToggle: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#2563EB',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  logToggleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  logOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.96)',
    padding: 16,
    paddingTop: 32,
  },
  logOverlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  logOverlayTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  logOverlayClose: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
  },
  logOverlayCloseText: {
    color: '#93C5FD',
    fontSize: 14,
    fontWeight: '600',
  },
  logView: {
    flex: 1,
  },
});

export default App;
