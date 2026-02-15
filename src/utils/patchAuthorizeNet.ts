/**
 * Patch for Authorize.Net SDK logger bug
 * 
 * The SDK's maskSensitiveFields function crashes when sensitive fields
 * (cardNumber, expirationDate, etc.) have null values because it tries
 * to access `.length` on null.
 * 
 * This patch must be imported BEFORE any authorizenet import.
 */

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const loggerModule = require('authorizenet/lib/logger');
  const originalGetLogger = loggerModule.getLogger;

  loggerModule.getLogger = function (loggerCategory?: string, mconfig?: any) {
    const logger = originalGetLogger(loggerCategory, mconfig);

    // Wrap logger methods to catch maskSensitiveFields crashes
    const methods = ['info', 'warn', 'error', 'debug', 'verbose', 'silly'];
    methods.forEach((method) => {
      const original = logger[method];
      if (typeof original === 'function') {
        logger[method] = function (...args: any[]) {
          try {
            return original.apply(this, args);
          } catch {
            // Silently ignore SDK logger crashes
          }
        };
      }
    });

    return logger;
  };
} catch {
  // authorizenet package not available, skip patching
}

export {};
