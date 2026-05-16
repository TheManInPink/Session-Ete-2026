/**
 * @file        route.ts (logout admin)
 * @description Shim — délègue au handler factory `@nina-aes/auth`.
 * @module      @nina-aes/admin
 */

import { buildLogoutHandler } from '@nina-aes/auth';
import { AUTH_CONFIG } from '../../../../lib/auth/session';

const handler = buildLogoutHandler(AUTH_CONFIG);
export const GET = handler.GET;
export const POST = handler.POST;
