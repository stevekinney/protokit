import pino from 'pino';
import { environment } from './env.js';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
	level: environment.LOG_LEVEL ?? 'info',
	...(!isProduction && {
		transport: { target: 'pino-pretty' },
	}),
});
