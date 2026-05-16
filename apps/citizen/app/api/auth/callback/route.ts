/**
 * @file        route.ts (callback)
 * @description Shim — délègue au handler factory `@nina-aes/auth`.
 * @module      @nina-aes/citizen
 */

import { buildCallbackHandler } from '@nina-aes/auth';
import { AUTH_CONFIG } from '../../../../lib/auth/session';

export const GET = buildCallbackHandler(AUTH_CONFIG);
