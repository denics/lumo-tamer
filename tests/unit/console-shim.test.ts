/**
 * Unit tests for console shim
 *
 * Tests the console redirection to pino logger, including the
 * suppressFullApiErrors feature that controls API error suppression.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Logger } from 'pino';
import {
  installConsoleShim,
  restoreConsole,
  suppressFullApiErrors,
} from '../../src/shims/console.js';

function createMockLogger() {
  return {
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  } as unknown as Logger;
}

describe('console shim', () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    installConsoleShim(mockLogger);
    // Reset to default state (errors not suppressed)
    suppressFullApiErrors(false);
  });

  afterEach(() => {
    restoreConsole();
  });

  describe('basic logging', () => {
    it('redirects console.log to logger.debug', () => {
      console.log('test message');
      expect(mockLogger.debug).toHaveBeenCalledWith(undefined, 'test message');
    });

    it('redirects console.info to logger.info', () => {
      console.info('info message');
      expect(mockLogger.info).toHaveBeenCalledWith(undefined, 'info message');
    });

    it('redirects console.warn to logger.warn', () => {
      console.warn('warning message');
      expect(mockLogger.warn).toHaveBeenCalledWith(undefined, 'warning message');
    });

    it('redirects console.error to logger.error', () => {
      console.error('error message');
      expect(mockLogger.error).toHaveBeenCalledWith(undefined, 'error message');
    });

    it('handles Error objects separately', () => {
      const error = new Error('test error');
      console.error('got error', error);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error }),
        'got error'
      );
    });
  });

  describe('log suppression', () => {
    it('suppresses saga trigger logs to trace', () => {
      console.log('Saga triggered: someSaga');
      expect(mockLogger.trace).toHaveBeenCalled();
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('suppresses action trigger logs to trace', () => {
      console.log('Action triggered: someAction');
      expect(mockLogger.trace).toHaveBeenCalled();
    });

    it('suppresses API logs to trace', () => {
      console.log('API: some api call');
      expect(mockLogger.trace).toHaveBeenCalled();
    });

    it('suppresses local only mode logs to trace', () => {
      console.log('Lumo API call ignored (local only mode)');
      expect(mockLogger.trace).toHaveBeenCalled();
    });
  });

  describe('suppressFullApiErrors', () => {
    it('does not suppress API errors by default', () => {
      console.error('list spaces failure');
      expect(mockLogger.error).toHaveBeenCalledWith(undefined, 'list spaces failure');
      expect(mockLogger.trace).not.toHaveBeenCalled();
    });

    it('does not suppress push errors by default', () => {
      console.error('push conversation failure');
      expect(mockLogger.error).toHaveBeenCalledWith(undefined, 'push conversation failure');
    });

    it('does not suppress 418 errors by default', () => {
      console.error('Request failed 418');
      expect(mockLogger.error).toHaveBeenCalledWith(undefined, 'Request failed 418');
    });

    it('suppresses API errors when suppressFullApiErrors(true) is called', () => {
      suppressFullApiErrors(true);
      console.error('list spaces failure');
      expect(mockLogger.trace).toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('suppresses push conversation errors when enabled', () => {
      suppressFullApiErrors(true);
      console.error('push conversation failure');
      expect(mockLogger.trace).toHaveBeenCalled();
    });

    it('suppresses push message errors when enabled', () => {
      suppressFullApiErrors(true);
      console.error('push message failure');
      expect(mockLogger.trace).toHaveBeenCalled();
    });

    it('suppresses push space errors when enabled', () => {
      suppressFullApiErrors(true);
      console.error('push space failure');
      expect(mockLogger.trace).toHaveBeenCalled();
    });

    it('suppresses push attachment errors when enabled', () => {
      suppressFullApiErrors(true);
      console.error('push attachment failure');
      expect(mockLogger.trace).toHaveBeenCalled();
    });

    it('suppresses pull spaces errors when enabled', () => {
      suppressFullApiErrors(true);
      console.error('Error pulling spaces');
      expect(mockLogger.trace).toHaveBeenCalled();
    });

    it('suppresses sync disabled errors when enabled', () => {
      suppressFullApiErrors(true);
      console.error('Sync disabled');
      expect(mockLogger.trace).toHaveBeenCalled();
    });

    it('suppresses 418 errors when enabled', () => {
      suppressFullApiErrors(true);
      console.error('Request failed 418');
      expect(mockLogger.trace).toHaveBeenCalled();
    });

    it('suppresses local only mode errors when enabled', () => {
      suppressFullApiErrors(true);
      console.error('Lumo API call ignored (local only mode)');
      expect(mockLogger.trace).toHaveBeenCalled();
    });

    it('suppresses Error objects with matching messages when enabled', () => {
      suppressFullApiErrors(true);
      const error = new Error('list spaces failure');
      console.error(error);
      expect(mockLogger.trace).toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('does not suppress non-API errors when enabled', () => {
      suppressFullApiErrors(true);
      console.error('some other error');
      expect(mockLogger.error).toHaveBeenCalledWith(undefined, 'some other error');
      expect(mockLogger.trace).not.toHaveBeenCalled();
    });

    it('can be toggled off after being enabled', () => {
      suppressFullApiErrors(true);
      console.error('list spaces failure');
      expect(mockLogger.trace).toHaveBeenCalled();

      vi.clearAllMocks();
      suppressFullApiErrors(false);
      console.error('list spaces failure');
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockLogger.trace).not.toHaveBeenCalled();
    });

    it('defaults to true when called without argument', () => {
      suppressFullApiErrors();
      console.error('push conversation failure');
      expect(mockLogger.trace).toHaveBeenCalled();
    });
  });
});
