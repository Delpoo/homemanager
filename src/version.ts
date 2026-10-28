/** Release version, injected by scripts/build.mjs from package.json. Test
 * bundles built without the define report "dev". */
declare const __HOMEMANAGER_VERSION__: string | undefined;
export const VERSION: string = typeof __HOMEMANAGER_VERSION__ === 'string' ? __HOMEMANAGER_VERSION__ : 'dev';
