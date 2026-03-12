import { randomUUID } from 'node:crypto';
import { environment } from '../env.js';

export const instanceIdentifier =
	environment.INSTANCE_IDENTIFIER ??
	environment.RAILWAY_REPLICA_IDENTIFIER ??
	environment.HOSTNAME_IDENTIFIER ??
	randomUUID();
