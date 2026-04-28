// TypeScript with `module: "commonjs"` lowers `await import('x')` to
// `Promise.resolve().then(() => require('x'))`, which fails for ESM-only packages
// (AdminJS et al.) because they do not provide a `require` export. The Function
// constructor preserves a real ESM dynamic `import()` because it is parsed as
// fresh ECMAScript and Node treats it as native ESM.
//
// Usage:
//   const { default: AdminJS } = await esmImport<typeof import('adminjs')>('adminjs');

const dynamicEsmImport = new Function(
  'specifier',
  'return import(specifier)',
) as <T = unknown>(specifier: string) => Promise<T>;

export function esmImport<T = unknown>(specifier: string): Promise<T> {
  return dynamicEsmImport<T>(specifier);
}
