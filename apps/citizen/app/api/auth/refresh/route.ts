/**
 * @file        route.ts (refresh)
 * @description Shim — délègue au handler factory `@nina-aes/auth`.
 * @module      @nina-aes/citizen
 */

import { buildRefreshHandler } from '@nina-aes/auth';
import { AUTH_CONFIG } from '../../../../lib/auth/session';

export const POST = buildRefreshHandler(AUTH_CONFIG);
