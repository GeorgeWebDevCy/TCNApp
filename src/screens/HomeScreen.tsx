import React, { useCallback, useMemo } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Switch, Text, View } from 'react-native';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useAuthContext } from '../contexts/AuthContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useNotifications } from '../notifications/OneSignalProvider';

export const HomeScreen: React.FC = () => {
  const { state, logout } = useAuthContext();
  const user = state.user;
  const { t } = useLocalization();
  const {
    preferences,
    setMarketingMuted,
    navigationIntent,
    clearNavigationIntent,
    activeSection,
    navigateToSection,
  } = useNotifications();
  const greeting = useMemo(
    () => t('home.title', { replace: { name: user?.name ? `, ${user.name}` : '' } }),
    [t, user?.name],
  );

  const marketingEnabled = !preferences.marketingMuted;

  const handleMarketingToggle = useCallback(
    (nextValue: boolean) => {
      void setMarketingMuted(!nextValue);
    },
    [setMarketingMuted],
  );

  const handleOpenIntent = useCallback(() => {
    if (!navigationIntent) {
      return;
    }

    navigateToSection(navigationIntent.target);
    clearNavigationIntent();
  }, [clearNavigationIntent, navigateToSection, navigationIntent]);

  const sectionLabelKey = `home.notifications.sections.${activeSection}`;
  const sectionLabel = t(sectionLabelKey, { defaultValue: activeSection });
  const notificationContextLabel = navigationIntent
    ? t(`home.notifications.contexts.${navigationIntent.context}`, {
        defaultValue: navigationIntent.context,
      })
    : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.switcherWrapper}>
          <LanguageSwitcher />
        </View>
        <Text style={styles.title}>{greeting}</Text>
        {user?.email ? <Text style={styles.subtitle}>{user.email}</Text> : null}

        <View style={styles.notificationCard}>
          <View style={styles.notificationHeader}>
            <Text style={styles.notificationTitle}>{t('home.notifications.title')}</Text>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>{t('home.notifications.marketingLabel')}</Text>
              <Switch
                value={marketingEnabled}
                onValueChange={handleMarketingToggle}
                accessibilityLabel={t('home.notifications.toggleAccessibility')}
              />
            </View>
          </View>
          <Text style={styles.notificationDescription}>{t('home.notifications.marketingDescription')}</Text>
          <Text style={styles.activeSection}>
            {t('home.notifications.activeSection', { replace: { section: sectionLabel } })}
          </Text>
        </View>

        {navigationIntent ? (
          <View style={styles.intentCard}>
            <Text style={styles.intentTitle}>
              {navigationIntent.title ?? t('home.notifications.intentTitle')}
            </Text>
            <Text style={styles.intentMessage}>
              {navigationIntent.message ??
                t('home.notifications.intentMessage', {
                  replace: {
                    context: notificationContextLabel ?? navigationIntent.context,
                    section: t(`home.notifications.sections.${navigationIntent.target}`),
                  },
                })}
            </Text>
            <View style={styles.intentActions}>
              <Pressable
                style={[styles.intentButton, styles.intentPrimary]}
                onPress={handleOpenIntent}
                accessibilityRole="button"
              >
                <Text style={styles.intentPrimaryText}>
                  {t('home.notifications.openSection', {
                    replace: { section: t(`home.notifications.sections.${navigationIntent.target}`) },
                  })}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.intentButton, styles.intentSecondary]}
                onPress={clearNavigationIntent}
                accessibilityRole="button"
              >
                <Text style={styles.intentSecondaryText}>{t('home.notifications.dismiss')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Pressable onPress={logout} style={styles.button} accessibilityRole="button">
          <Text style={styles.buttonText}>{t('home.logout')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 16,
    padding: 24,
    paddingTop: 48,
  },
  switcherWrapper: {
    alignSelf: 'flex-end',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 16,
    color: '#475569',
  },
  notificationCard: {
    width: '100%',
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    gap: 12,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  notificationTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  notificationDescription: {
    fontSize: 14,
    color: '#1E293B',
  },
  activeSection: {
    fontSize: 14,
    color: '#1E40AF',
    fontWeight: '600',
  },
  intentCard: {
    width: '100%',
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 12,
  },
  intentTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  intentMessage: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
  },
  intentActions: {
    flexDirection: 'row',
    gap: 12,
  },
  intentButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intentPrimary: {
    backgroundColor: '#2563EB',
  },
  intentPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  intentSecondary: {
    backgroundColor: '#E2E8F0',
  },
  intentSecondaryText: {
    color: '#1E3A8A',
    fontWeight: '600',
    fontSize: 14,
  },
  button: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#2563EB',
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
});
