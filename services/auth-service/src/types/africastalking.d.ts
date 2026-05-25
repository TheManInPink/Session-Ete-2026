/**
 * @file        africastalking.d.ts
 * @description Déclaration ambient pour le SDK `africastalking` qui ne
 *              publie pas de types officiels (et `@types/africastalking`
 *              n'existe pas sur DefinitelyTyped).
 *
 *              Surface limitée à ce qui est réellement utilisé dans
 *              `AfricasTalkingSmsProvider` — à étendre si on consomme
 *              d'autres APIs (voice, payments).
 *
 * @module      auth-service/types
 */

declare module 'africastalking' {
  export interface AfricasTalkingSmsSendOptions {
    to: string | string[];
    message: string;
    from?: string;
  }

  export interface AfricasTalkingSmsRecipient {
    statusCode: number;
    number: string;
    status: string;
    cost: string;
    messageId: string;
  }

  export interface AfricasTalkingSmsSendResult {
    SMSMessageData: {
      Message: string;
      Recipients: AfricasTalkingSmsRecipient[];
    };
  }

  export interface AfricasTalkingSdk {
    SMS: {
      send(opts: AfricasTalkingSmsSendOptions): Promise<AfricasTalkingSmsSendResult>;
    };
  }

  const factory: (opts: { apiKey: string; username: string }) => AfricasTalkingSdk;
  export default factory;
}
