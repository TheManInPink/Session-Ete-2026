/**
 * @file        route.ts (login)
 * @description Shim — délègue au handler factory `@nina-aes/auth`.
 * @module      @nina-aes/citizen
 */

import { buildLoginHandler } from '@nina-aes/auth';
import { AUTH_CONFIG } from '../../../../lib/auth/session';

export const GET = buildLoginHandler(AUTH_CONFIG);
