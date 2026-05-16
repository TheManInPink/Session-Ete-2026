/**
 * @file        route.ts (callback admin)
 * @description Shim — délègue au handler factory `@nina-aes/auth`.
 * @module      @nina-aes/admin
 */

import { buildCallbackHandler } from '@nina-aes/auth';
import { AUTH_CONFIG } from '../../../../lib/auth/session';

export const GET = buildCallbackHandler(AUTH_CONFIG);
