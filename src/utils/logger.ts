// utils/logger.ts

import winston from 'winston';
import path from 'path';

// Ensure logs directory exists
const logPath = path.join(__dirname, '../logs');

const logger = winston.createLogger({
  level: 'info', // default level
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    // Log to a file
    new winston.transports.File({
      filename: path.join(logPath, 'error.log'),
      level: 'error',
    }),
  ],
});

// In development, log to console also
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

export default logger;
