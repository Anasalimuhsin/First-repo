import pino from 'pino';

// Structured JSON logs. Never log request bodies: they contain children's messages.
export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});
