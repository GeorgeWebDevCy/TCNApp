const AsyncStorage = require('@react-native-async-storage/async-storage');

beforeEach(() => {
  if (typeof AsyncStorage.clear === 'function') {
    AsyncStorage.clear();
  }
});
