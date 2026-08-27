import type { McpResourceDefinition } from '../types/primitives.js';
import type { McpScope } from '../scopes.js';

export { userProfileResource } from './user-profile.js';

import { userProfileResource } from './user-profile.js';

export const allResources: McpResourceDefinition<McpScope>[] = [userProfileResource];
