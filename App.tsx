// The root of the React Native application. Here we stitch together the global providers
// and render the high-level screens. The goal of this file is to orchestrate application
// state and supporting services (authentication, localization, payments, logging, etc.)
// rather than hold any domain-specific logic. Because the composition of providers can
// be non-trivial for new contributors, we comment each section in detail.
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { TransactionProvider } from './src/contexts/TransactionContext';
import { TokenLoginProvider } from './src/providers/TokenLoginProvider';
import { LocalizationProvider } from './src/contexts/LocalizationContext';
import { OneSignalProvider } from './src/notifications/OneSignalProvider';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { UserProfileScreen } from './src/screens/UserProfileScreen';
import { MembershipScreen } from './src/screens/MembershipScreen';
import { VendorScanScreen } from './src/screens/VendorScanScreen';
import { MemberDashboardScreen } from './src/screens/MemberDashboardScreen';
import { VendorDashboardScreen } from './src/screens/VendorDashboardScreen';
import { AdminDashboardScreen } from './src/screens/AdminDashboardScreen';
import { PostLoginDiagnosticsScreen } from './src/screens/PostLoginDiagnosticsScreen';
import { STRIPE_CONFIG } from './src/config/stripeConfig';
import { MembershipDebugScreen } from './src/screens/MembershipDebugScreen';
import { COLORS } from './src/config/theme';
import { ErrorNotifier } from './src/components/ErrorNotifier';

// AppContent is intentionally separated from the surrounding provider tree so we can
// consume the AuthContext without worrying about provider order in the JSX tree below.
// This component makes all routing decisions based on authentication state and user
// interactions, keeping the top-level App component focused on wiring.
const AppContent: React.FC = () => {
  const {
    state: { isAuthenticated, isLoading, user },
  } = useAuthContext();
  // Track which high-level screen the authenticated user is currently viewing.
  // We model the navigation stack as a discriminated union to keep the state strict.
  const [activeScreen, setActiveScreen] = useState<
    | 'home'
    | 'profile'
    | 'membership'
    | 'memberAnalytics'
    | 'vendorScan'
    | 'vendorAnalytics'
    | 'adminDashboard'
    | 'membershipDebug'
  >('home');
  const [hasCompletedDiagnostics, setHasCompletedDiagnostics] = useState(false);

  const normalizedAccountType = (user?.accountType ?? '').toLowerCase();
  const isVendor = normalizedAccountType === 'vendor';
  const isAdmin =
    normalizedAccountType === 'admin' || normalizedAccountType === 'staff';
  const adminInitialisedRef = useRef(false);

  useEffect(() => {
    // Whenever the user signs out we reset the active screen to "home". This prevents
    // stale state from trying to render profile/membership views while the LoginScreen
    // should be shown instead.
    if (!isAuthenticated) {
      setActiveScreen('home');
      setHasCompletedDiagnostics(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    setActiveScreen(current => {
      if (isVendor) {
        return current === 'vendorScan' || current === 'vendorAnalytics'
          ? current
          : 'vendorScan';
      }

      if (isAdmin) {
        if (current === 'vendorScan' || current === 'vendorAnalytics') {
          return 'adminDashboard';
        }
        return current;
      }

      if (current === 'vendorScan' || current === 'vendorAnalytics') {
        return 'home';
      }

      if (current === 'adminDashboard') {
        return 'home';
      }

      return current;
    });
  }, [isAdmin, isVendor]);

  useEffect(() => {
    if (!isAdmin) {
      adminInitialisedRef.current = false;
      return;
    }

    if (!adminInitialisedRef.current) {
      adminInitialisedRef.current = true;
      setActiveScreen('adminDashboard');
    }
  }, [isAdmin]);

  if (isLoading) {
    // While authentication is bootstrapping (e.g., validating stored tokens) we display
    // a centered loading indicator to block the UI until the result is known.
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    // No authenticated session found, so we show the login experience. The AuthProvider
    // will update the context once the user signs in.
    return <LoginScreen />;
  }

  if (!hasCompletedDiagnostics) {
    return (
      <PostLoginDiagnosticsScreen
        onComplete={() => setHasCompletedDiagnostics(true)}
        onSkip={() => setHasCompletedDiagnostics(true)}
      />
    );
  }

  let content: JSX.Element;
  if (isAdmin && activeScreen === 'adminDashboard') {
    content = (
      <AdminDashboardScreen
        onOpenMemberExperience={() => setActiveScreen('home')}
      />
    );
  } else if (isVendor) {
    if (activeScreen === 'vendorAnalytics') {
      content = (
        <VendorDashboardScreen onBack={() => setActiveScreen('vendorScan')} />
      );
    } else {
      content = (
        <VendorScanScreen
          onShowAnalytics={() => setActiveScreen('vendorAnalytics')}
        />
      );
    }
  } else if (activeScreen === 'profile') {
    content = <UserProfileScreen onBack={() => setActiveScreen('home')} />;
  } else if (activeScreen === 'membership') {
    content = <MembershipScreen onBack={() => setActiveScreen('home')} />;
  } else if (activeScreen === 'memberAnalytics') {
    content = <MemberDashboardScreen onBack={() => setActiveScreen('home')} />;
  } else if (activeScreen === 'membershipDebug') {
    content = <MembershipDebugScreen onBack={() => setActiveScreen('home')} />;
  } else {
    content = (
      <HomeScreen
        onManageProfile={() => setActiveScreen('profile')}
        onUpgradeMembership={() => setActiveScreen('membership')}
        onViewAnalytics={() => setActiveScreen('memberAnalytics')}
        onOpenAdminConsole={() => setActiveScreen('adminDashboard')}
        onOpenMembershipDebug={() => setActiveScreen('membershipDebug')}
      />
    );
  }

  return <View style={{ flex: 1 }}>{content}</View>;
};

function App(): JSX.Element {
  // Control whether the device log overlay is visible. Developers can toggle this to
  // inspect logs directly on-device without connecting to a remote debugger.
  const [areLogsVisible, setAreLogsVisible] = useState(false);
  // Extract Stripe configuration values so we can memoize them and avoid re-creating
  // the provider props on every render. Any change would cause the Stripe SDK to
  // reinitialize, so we minimize churn here.
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
    // Initialize the device logging utility once. We persist logs to AsyncStorage so
    // they survive app restarts, which is invaluable when diagnosing issues reported
    // by QA or end users. The logger also mirrors messages to the native console.
    deviceLog
      .init(AsyncStorage, {
        logToConsole: true,
        logRNErrors: true,
        maxNumberToRender: 1000,
        maxNumberToPersist: 1000,
      })
      .then(() => {
        // We log a message once initialization completes so we can verify the logger
        // is wired up correctly even if no other logs have been emitted yet.
        deviceLog.info('Device log initialized');
      })
      .catch(error => {
        // Intentionally swallow initialization errors but surface them in the console.
        // Failing to set up deviceLog should not prevent the rest of the application
        // from working.
        console.warn('Failed to initialize device log', error);
      });
  }, []);

  return (
    // Provider stack:
    // 1. StripeProvider: Configures the Stripe SDK for payments.
    // 2. LocalizationProvider: Supplies localized strings and locale helpers.
    // 3. SafeAreaProvider: Ensures layouts respect device safe areas (notches, etc.).
    // 4. TokenLoginProvider: Handles token-based authentication flows.
    // 5. AuthProvider: Maintains authentication state exposed via useAuthContext.
    // 6. OneSignalProvider: Sets up push notification support.
    <StripeProvider {...stripeProviderProps}>
      <LocalizationProvider>
        <SafeAreaProvider>
          <TokenLoginProvider>
            <AuthProvider>
              <TransactionProvider>
                <OneSignalProvider>
                  <View style={styles.appContainer}>
                    <ErrorNotifier />
                    {/* Render the conditional app content discussed above. */}
                    <AppContent />
                  {!areLogsVisible && (
                    // When the log overlay is hidden we show a floating action button
                    // styled as "Show Logs" to let developers bring it into view.
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
                        // LogView is provided by the deviceLog utility and renders a
                        // scrollable list of logs. We expand entries by default and
                        // use a 24-hour timestamp for easier reading.
                        style={styles.logView}
                        multiExpanded
                        timeStampFormat="HH:mm:ss"
                      />
                    </View>
                  )}
                  </View>
                </OneSignalProvider>
              </TransactionProvider>
            </AuthProvider>
          </TokenLoginProvider>
        </SafeAreaProvider>
      </LocalizationProvider>
    </StripeProvider>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    // Ensure the root container fills the screen so nested components can rely on
    // flex layout to position themselves.
    flex: 1,
  },
  loadingContainer: {
    // Standard centered loading pattern while authentication is resolving.
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  logToggle: {
    // Position the "Show Logs" button as a floating pill in the bottom-right corner.
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
    // Ensure the toggle text is legible against the primary background.
    color: COLORS.textOnPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  logOverlay: {
    // Full-screen translucent overlay that hosts the log viewer when visible.
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay,
    padding: 16,
    paddingTop: 32,
  },
  logOverlayHeader: {
    // Header row contains the title and action buttons (clear/close).
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  logOverlayActions: {
    // Layout the two action buttons horizontally with a small gap.
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logOverlayTitle: {
    // Title styling for the overlay header.
    color: COLORS.textOnPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  logOverlaySecondary: {
    // Secondary button styling shared by "Clear" and "Close" controls.
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.overlayMuted,
  },
  logOverlaySecondaryText: {
    // Provide sufficient contrast for the secondary button labels.
    color: COLORS.primaryLighter,
    fontSize: 14,
    fontWeight: '600',
  },
  logOverlayClose: {
    // Styling mirrors logOverlaySecondary but kept separate in case we need to
    // customize the close button independently in the future.
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.overlayMuted,
  },
  logOverlayCloseText: {
    // Same rationale as logOverlaySecondaryText—explicit style prevents regressions.
    color: COLORS.primaryLighter,
    fontSize: 14,
    fontWeight: '600',
  },
  logView: {
    // Allow the log list to expand and occupy the remaining overlay space.
    flex: 1,
  },
});

export default App;
