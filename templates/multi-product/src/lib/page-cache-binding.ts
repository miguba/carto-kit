export const getPageCacheBinding = async () => {
  try {
    const moduleName = "cloudflare" + ":workers";
    const workers = (await import(
      /* @vite-ignore */ moduleName
    )) as {
      env?: {
        KV_STORE?: KVNamespace;
      };
    };

    return workers.env?.KV_STORE;
  } catch {
    return undefined;
  }
};
