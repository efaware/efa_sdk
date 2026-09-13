/**
 * @efa-one/sdk/backend — Server-seitige Integrationsschicht für efa-one-Apps.
 *
 * Enthält: JWT-/Session-Auth + Token-Exchange, Health-Endpoint, Service-Discovery
 * und Gateway-Client (App-zu-App), Clients zu Plattform-Services (Audit, Reporting,
 * Mail, Notifications), Permission-Auflösung/-Registrierung und Capability-Registry.
 *
 * Barrel-Export: `import { requireAuth, serviceClient } from '@efa-one/sdk/backend'`.
 * Einzelmodule bleiben zusätzlich unter `@efa-one/sdk/backend/<modul>` erreichbar.
 */
export * from './auth';
export * from './health';
export * from './audit';
export * from './reporting';
export * from './mail';
export * from './notifications';
export * from './permissions';
export * from './permissionClient';
export * from './sessionStatusClient';
export * from './permissionCheck';
export * from './customPermissions';
export * from './serviceClient';
export * from './serviceDiscovery';
export * from './apiRegistry';
export * from './i18n-backend';
