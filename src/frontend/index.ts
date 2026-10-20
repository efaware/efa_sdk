/**
 * @efa-one/sdk/frontend — Browser-seitige Integrationsschicht für efa-one-Apps.
 *
 * Enthält: postMessage-/IPC-Protokoll mit dem Kernel (CONVERGE_AUTH-Empfang,
 * GO_BACK, DeclareAppInfo, Navigation, Route-Change), react-i18next-Factory,
 * die plattformweiten Datums-/Zeit-Formatierer, die Plattform-Admin-Prüfung
 * (`isPlatformAdmin`) und den Dev-Header.
 *
 * Barrel-Export: `import { registerAppInfo, initI18n, DevHeader } from '@efa-one/sdk/frontend'`.
 * Einzelmodule bleiben zusätzlich unter `@efa-one/sdk/frontend/<modul>` erreichbar.
 */
export * from './ipc.js';
export * from './format.js';
export * from './platformAdmin.js';
export { useIsMobile, MOBILE_QUERY } from './useIsMobile.js';
export * from './i18n.js';
export { default as DevHeader } from './DevHeader.js';
