import { createInMemoryOAuthStores } from './index.js';
import { runOAuthStoreConformance } from '../../testing/oauth-store-conformance.js';

runOAuthStoreConformance('in-memory', createInMemoryOAuthStores);
