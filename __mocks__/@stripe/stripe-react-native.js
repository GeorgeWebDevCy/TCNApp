export const StripeProvider = ({ children }) => children;
export const useStripe = () => ({
  presentPaymentSheet: jest.fn(),
  initPaymentSheet: jest.fn(),
});
export default { StripeProvider, useStripe };
