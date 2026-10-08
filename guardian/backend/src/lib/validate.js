import { z } from 'zod';
import { HttpError } from './errors.js';

/** Parse with a zod schema; a failure becomes a 400 with a readable message. */
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue.path.length ? `${issue.path.join('.')}: ` : '';
    throw new HttpError(400, `${where}${issue.message}`);
  }
  return result.data;
}

export const uuid = z.uuid();
export const isoDate = z.coerce.date();
export const latitude = z.number().min(-90).max(90);
export const longitude = z.number().min(-180).max(180);
export const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM');
export { z };
