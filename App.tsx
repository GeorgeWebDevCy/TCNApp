import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StripeProvider } from '@stripe/stripe-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import deviceLog, { LogView } from './src/utils/deviceLog';
import { AuthProvider, useAuthContext } from './src/contexts/AuthContext';
import { TokenLoginProvider } from './src/providers/TokenLoginProvider';
import { LocalizationProvider } from './src/contexts/LocalizationContext';
import { OneSignalProvider } from './src/notifications/OneSignalProvider';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { UserProfileScreen } from './src/screens/UserProfileScreen';
import { MembershipScreen } from './src/screens/MembershipScreen';
import { STRIPE_CONFIG } from './src/config/stripeConfig';
import { COLORS } from './src/config/theme';

const AppContent: React.FC = () => {
  const {
    state: { isAuthenticated, isLoading },
  } = useAuthContext();
  const [activeScreen, setActiveScreen] = useState<
    'home' | 'profile' | 'membership'
  >('home');

  useEffect(() => {
    if (!isAuthenticated) {
      setActiveScreen('home');
    }
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  if (activeScreen === 'profile') {
    return <UserProfileScreen onBack={() => setActiveScreen('home')} />;
  }

  if (activeScreen === 'membership') {
    return <MembershipScreen onBack={() => setActiveScreen('home')} />;
  }

  return (
    <HomeScreen
      onManageProfile={() => setActiveScreen('profile')}
      onUpgradeMembership={() => setActiveScreen('membership')}
    />
  );
};

function App(): JSX.Element {
  const [areLogsVisible, setAreLogsVisible] = useState(false);
  const { publishableKey, merchantIdentifier, urlScheme } = STRIPE_CONFIG;
  const stripeProviderProps = useMemo(
    () => ({
      publishableKey,
      merchantIdentifier,
      urlScheme,
    }),
    [merchantIdentifier, publishableKey, urlScheme],
  );

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
      .catch(error => {
        console.warn('Failed to initialize device log', error);
      });
  }, []);

  return (
    <StripeProvider {...stripeProviderProps}>
      <LocalizationProvider>
        <SafeAreaProvider>
          <TokenLoginProvider>
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
                        <View style={styles.logOverlayActions}>
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="Clear device logs"
                            onPress={() => deviceLog.clear()}
                            style={styles.logOverlaySecondary}
                          >
                            <Text style={styles.logOverlaySecondaryText}>Clear</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="Hide device logs"
                            onPress={() => setAreLogsVisible(false)}
                            style={styles.logOverlayClose}
                          >
                            <Text style={styles.logOverlayCloseText}>Close</Text>
                          </TouchableOpacity>
                        </View>
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
          </TokenLoginProvider>
        </SafeAreaProvider>
      </LocalizationProvider>
    </StripeProvider>
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
    backgroundColor: COLORS.surface,
  },
  logToggle: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primaryDark,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  logToggleText: {
    color: COLORS.textOnPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  logOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay,
    padding: 16,
    paddingTop: 32,
  },
  logOverlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  logOverlayActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logOverlayTitle: {
    color: COLORS.textOnPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  logOverlaySecondary: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.overlayMuted,
  },
  logOverlaySecondaryText: {
    color: COLORS.primaryLighter,
    fontSize: 14,
    fontWeight: '600',
  },
  logOverlayClose: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.overlayMuted,
  },
  logOverlayCloseText: {
    color: COLORS.primaryLighter,
    fontSize: 14,
    fontWeight: '600',
  },
  logView: {
    flex: 1,
  },
});

export default App;
