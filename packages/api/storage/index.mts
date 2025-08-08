import type { StorageProvider } from './types.mjs';
import fsProvider, { FileSystemStorageProvider } from './fs-provider.mjs';

let provider: StorageProvider | null = null;

function buildProviderFromEnv(): StorageProvider {
  const providerName = process.env.SRCBOOK_STORAGE_PROVIDER?.toLowerCase() || 'filesystem';
  switch (providerName) {
    case 'filesystem':
    case 'fs':
      return fsProvider;
    // Placeholder for future providers; can be extended to dynamic import
    // case 'memory':
    //   return new InMemoryStorageProvider();
    default:
      console.warn(`Unknown storage provider '${providerName}', defaulting to filesystem`);
      return fsProvider;
  }
}

export function getStorageProvider(): StorageProvider {
  if (!provider) provider = buildProviderFromEnv();
  return provider;
}

export function setStorageProvider(p: StorageProvider) {
  provider = p;
}

export { FileSystemStorageProvider };
export type { StorageProvider };