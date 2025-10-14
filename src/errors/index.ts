export type { ErrorDescriptor, ErrorId, ErrorSeverity } from './errorCatalog';
export { ERROR_CATALOG, getErrorDescriptor } from './errorCatalog';
export {
  AppError,
  AppErrorOptions,
  createAppError,
  ensureAppError,
  findDescriptorByCode,
  isAppError,
} from './appError';
