/**
 * @file        route.ts (refresh admin)
 * @description Shim — délègue au handler factory `@nina-aes/auth`.
 * @module      @nina-aes/admin
 */

import { buildRefreshHandler } from '@nina-aes/auth';
import { AUTH_CONFIG } from '../../../../lib/auth/session';

export const POST = buildRefreshHandler(AUTH_CONFIG);
