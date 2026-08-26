import { randomUUID } from 'node:crypto';
import { environment } from '@web/env';

export const instanceIdentifier =
	environment.instanceIdentifier ??
	environment.railwayReplicaIdentifier ??
	environment.hostnameIdentifier ??
	randomUUID();
