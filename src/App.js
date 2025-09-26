import React from 'react';
import {SafeAreaView, StatusBar, StyleSheet, Text, View} from 'react-native';
import OneSignalProvider from './notifications/OneSignalProvider';

const App = () => {
  return (
    <OneSignalProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.container}>
          <Text style={styles.title}>TCN React Native Boilerplate</Text>
          <Text style={styles.body}>
            OneSignal is configured and ready for your app ID. Update
            <Text style={styles.bold}> OneSignalProvider.js </Text>
            with your project's identifiers to start receiving push notifications.
          </Text>
        </View>
      </SafeAreaView>
    </OneSignalProvider>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f4f4f5',
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#f4f4f5',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
    color: '#111827',
    textAlign: 'center',
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    color: '#374151',
    textAlign: 'center',
  },
  bold: {
    fontWeight: '600',
  },
});

export default App;
