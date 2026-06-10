import { createStorage } from 'unstorage';
import cloudflareKVBindingDriver from 'unstorage/drivers/cloudflare-kv-binding';

const memoryStorage = createStorage();

export const storage = (binding?: KVNamespace) => {
  if (binding) {
    return createStorage({
      driver: cloudflareKVBindingDriver({ binding }),
    });
  } else {
    // In production (Cloudflare Workers), a KV binding is always provided.
    // Return an in-memory fallback for dev without KV.
    return memoryStorage;
  }
};
