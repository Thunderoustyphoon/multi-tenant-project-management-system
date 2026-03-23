/**
 * Structured Logger Utility
 * Replaces raw console.* calls with structured, leveled logging.
 * Ultracite Rule: "Don't use console."
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: unknown;
}

const formatEntry = (level: LogLevel, message: string, data?: unknown): LogEntry => ({
  level,
  message,
  timestamp: new Date().toISOString(),
  ...(data !== undefined ? { data } : {}),
});

/* eslint-disable no-console -- Logger is the only file allowed to use console */
const logger = {
  info: (message: string, data?: unknown): void => {
    const entry = formatEntry('info', message, data);
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  },

  warn: (message: string, data?: unknown): void => {
    const entry = formatEntry('warn', message, data);
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  },

  error: (message: string, data?: unknown): void => {
    const entry = formatEntry('error', message, data);
    process.stderr.write(`${JSON.stringify(entry)}\n`);
  },

  debug: (message: string, data?: unknown): void => {
    if (process.env.NODE_ENV === 'development') {
      const entry = formatEntry('debug', message, data);
      process.stdout.write(`${JSON.stringify(entry)}\n`);
    }
  },
};
/* eslint-enable no-console */

export default logger;
