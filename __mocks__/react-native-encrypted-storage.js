const store = new Map();

module.exports = {
  setItem: jest.fn(async (key, value) => {
    store.set(key, value);
  }),
  getItem: jest.fn(async key => {
    return store.has(key) ? store.get(key) : null;
  }),
  removeItem: jest.fn(async key => {
    store.delete(key);
  }),
  clear: jest.fn(async () => {
    store.clear();
  }),
};
