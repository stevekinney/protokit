import { randomUUID } from 'node:crypto';
import { environment } from '@web/env';

export const instanceIdentifier =
	environment.INSTANCE_IDENTIFIER ??
	environment.RAILWAY_REPLICA_IDENTIFIER ??
	environment.HOSTNAME_IDENTIFIER ??
	randomUUID();
