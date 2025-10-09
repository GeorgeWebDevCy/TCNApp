import React, {
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import { useAuthContext } from './AuthContext';
import { TransactionRecord } from '../types/transactions';

interface TransactionState {
  transactions: TransactionRecord[];
}

type TransactionAction =
  | { type: 'ADD'; payload: TransactionRecord }
  | { type: 'UPDATE'; payload: { id: string; record: TransactionRecord } }
  | { type: 'PATCH'; payload: { id: string; updates: Partial<TransactionRecord> } }
  | { type: 'SET_ALL'; payload: TransactionRecord[] }
  | { type: 'RESET' };

const initialState: TransactionState = {
  transactions: [],
};

const transactionReducer = (
  state: TransactionState,
  action: TransactionAction,
): TransactionState => {
  switch (action.type) {
    case 'ADD': {
      const existingIndex = state.transactions.findIndex(
        transaction => transaction.id === action.payload.id,
      );

      if (existingIndex !== -1) {
        const updated = [...state.transactions];
        updated[existingIndex] = action.payload;
        return { transactions: updated };
      }

      return { transactions: [action.payload, ...state.transactions] };
    }
    case 'UPDATE': {
      const index = state.transactions.findIndex(
        transaction => transaction.id === action.payload.id,
      );
      if (index === -1) {
        return state;
      }

      const updated = [...state.transactions];
      updated[index] = action.payload.record;
      return { transactions: updated };
    }
    case 'PATCH': {
      const index = state.transactions.findIndex(
        transaction => transaction.id === action.payload.id,
      );
      if (index === -1) {
        return state;
      }

      const updated = [...state.transactions];
      const nextRecord = {
        ...updated[index],
        ...action.payload.updates,
      };

      if (
        action.payload.updates.id &&
        action.payload.updates.id !== action.payload.id
      ) {
        nextRecord.id = action.payload.updates.id;
      }

      updated[index] = nextRecord;

      const deduped = updated.filter((transaction, idx) => {
        if (idx === index) {
          return true;
        }
        return transaction.id !== nextRecord.id;
      });

      return { transactions: deduped };
    }
    case 'SET_ALL':
      return { transactions: [...action.payload] };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
};

export const __transactionInitialStateForTests = initialState;
export const __transactionReducerForTests = transactionReducer;

type TransactionContextValue = {
  transactions: TransactionRecord[];
  addTransaction: (transaction: TransactionRecord) => void;
  replaceTransaction: (id: string, record: TransactionRecord) => void;
  patchTransaction: (
    id: string,
    updates: Partial<TransactionRecord>,
  ) => TransactionRecord | null;
  setTransactions: (records: TransactionRecord[]) => void;
};

const TransactionContext = createContext<TransactionContextValue | undefined>(
  undefined,
);

export const TransactionProvider: React.FC<PropsWithChildren> = ({
  children,
}) => {
  const [state, dispatch] = useReducer(transactionReducer, initialState);
  const {
    state: { isAuthenticated },
  } = useAuthContext();

  useEffect(() => {
    if (!isAuthenticated) {
      dispatch({ type: 'RESET' });
    }
  }, [isAuthenticated]);

  const value = useMemo<TransactionContextValue>(
    () => ({
      transactions: state.transactions,
      addTransaction: transaction => dispatch({ type: 'ADD', payload: transaction }),
      replaceTransaction: (id, record) =>
        dispatch({ type: 'UPDATE', payload: { id, record } }),
      patchTransaction: (id, updates) => {
        const existing = state.transactions.find(
          transaction => transaction.id === id,
        );
        if (!existing) {
          return null;
        }
        const nextRecord = { ...existing, ...updates };
        dispatch({
          type: 'PATCH',
          payload: { id, updates },
        });
        return nextRecord;
      },
      setTransactions: records =>
        dispatch({ type: 'SET_ALL', payload: records }),
    }),
    [state.transactions],
  );

  return (
    <TransactionContext.Provider value={value}>
      {children}
    </TransactionContext.Provider>
  );
};

export const useTransactionContext = (): TransactionContextValue => {
  const context = useContext(TransactionContext);
  if (!context) {
    throw new Error('useTransactionContext must be used within a TransactionProvider');
  }
  return context;
};
