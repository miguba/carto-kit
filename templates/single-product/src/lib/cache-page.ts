import { storage } from './storage';

type DeploymentTarget = 'cloudflare-workers' | 'vps' | 'memory';

export interface PageRes<T = unknown> {
  status: 'success' | 'error';
  code: 200 | 500 | 404;
  data: T;
  msg?: string;
}

interface CachePageOptions<T> {
  fun?: () => Promise<T>;
  refresh?: boolean;
  ttl?: number;
  kvCache?: KVNamespace;
  deploymentTarget?: DeploymentTarget;
  cacheDir?: string;
  cachePrefix?: string;
}

interface CacheEngine {
  getItem(cacheKey: string): Promise<unknown | null>;
  setItem(
    cacheKey: string,
    value: unknown,
    options?: { ttl?: number },
  ): Promise<void>;
}

const isPageRes = <T = unknown>(value: unknown): value is PageRes<T> => {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<PageRes<T>>;

  return (
    (candidate.status === 'success' || candidate.status === 'error') &&
    (candidate.code === 200 ||
      candidate.code === 404 ||
      candidate.code === 500) &&
    'data' in candidate
  );
};

const buildSuccess = <T>(data: T): PageRes<T> => ({
  status: 'success',
  code: 200,
  data,
});

const getSetOptions = (ttl: number | undefined) => {
  if (!ttl || ttl <= 0) return undefined;

  return { ttl };
};

const getProcessEnv = () =>
  (
    globalThis as typeof globalThis & {
      process?: {
        cwd?: () => string;
        env?: Record<string, string | undefined>;
      };
    }
  ).process?.env;

const getDeploymentTarget = (
  kvCache: KVNamespace | undefined,
  deploymentTarget: DeploymentTarget | undefined,
): DeploymentTarget => {
  if (deploymentTarget) return deploymentTarget;
  if (kvCache) return 'cloudflare-workers';

  return getProcessEnv()?.DEPLOYMENT_TARGET === 'vps' ? 'vps' : 'memory';
};

const memoryEngine = storage();

const getMemoryEngine = (): CacheEngine => ({
  getItem: (cacheKey) => memoryEngine.getItem(cacheKey),
  setItem: (cacheKey, value, options) =>
    memoryEngine.setItem(cacheKey, value as object, options),
});

const getCloudflareEngine = (kvCache: KVNamespace): CacheEngine => {
  const cloudflareStorage = storage(kvCache);

  return {
    getItem: (cacheKey) => cloudflareStorage.getItem(cacheKey),
    setItem: (cacheKey, value, options) =>
      cloudflareStorage.setItem(cacheKey, value as object, options),
  };
};

const getVpsCacheDir = (cacheDir: string | undefined) => {
  const env = getProcessEnv();
  const cwd =
    (
      globalThis as typeof globalThis & { process?: { cwd?: () => string } }
    ).process?.cwd?.() ?? '.';

  return cacheDir || env?.PAGE_CACHE_DIR || `${cwd}/.cache`;
};

const getCachePrefix = (cachePrefix: string | undefined) =>
  (cachePrefix ?? getProcessEnv()?.PAGE_CACHE_PREFIX ?? '').trim();

const prefixCacheKey = (cacheKey: string, cachePrefix: string | undefined) => {
  const prefix = getCachePrefix(cachePrefix);
  return prefix ? `${prefix}:${cacheKey}` : cacheKey;
};

const cacheFileName = (cacheKey: string) =>
  encodeURIComponent(cacheKey).replaceAll('%', '~');

const getVpsEngine = (cacheDir: string | undefined): CacheEngine => {
  const root = getVpsCacheDir(cacheDir);

  return {
    async getItem(cacheKey): Promise<unknown | null> {
      try {
        const fsModuleName = 'node:' + 'fs/promises';
        const pathModuleName = 'node:' + 'path';
        const fs = await import(/* @vite-ignore */ fsModuleName);
        const path = await import(/* @vite-ignore */ pathModuleName);
        const filePath = path.join(root, `${cacheFileName(cacheKey)}.json`);
        const raw = await fs.readFile(filePath, 'utf8');
        const cached = JSON.parse(raw) as {
          expiresAt?: number;
          value?: unknown;
        };

        if (cached.expiresAt && cached.expiresAt <= Date.now()) {
          await fs.rm(filePath, { force: true });
          return null;
        }

        return cached.value ?? null;
      } catch (error: unknown) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'ENOENT'
        ) {
          return null;
        }

        console.warn(`Unable to read VPS page cache for key: ${cacheKey}`);
        return null;
      }
    },
    async setItem(cacheKey, value, options) {
      const fsModuleName = 'node:' + 'fs/promises';
      const pathModuleName = 'node:' + 'path';
      const fs = await import(/* @vite-ignore */ fsModuleName);
      const path = await import(/* @vite-ignore */ pathModuleName);
      const filePath = path.join(root, `${cacheFileName(cacheKey)}.json`);
      const ttl = options?.ttl;
      const payload = {
        value,
        expiresAt: ttl && ttl > 0 ? Date.now() + ttl * 1000 : undefined,
      };

      await fs.mkdir(root, { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(payload), 'utf8');
    },
  };
};

const getCacheEngine = ({
  kvCache,
  deploymentTarget,
  cacheDir,
}: {
  kvCache?: KVNamespace;
  deploymentTarget?: DeploymentTarget;
  cacheDir?: string;
}): CacheEngine => {
  const target = getDeploymentTarget(kvCache, deploymentTarget);

  if (target === 'cloudflare-workers' && kvCache) {
    return getCloudflareEngine(kvCache);
  }

  if (target === 'vps') {
    return getVpsEngine(cacheDir);
  }

  return getMemoryEngine();
};

export async function cachePage<T = unknown>(
  cacheKey: string,
  options: CachePageOptions<T> & { fun: () => Promise<T> },
): Promise<PageRes<T>>;
export async function cachePage<T = unknown>(
  cacheKey: string,
  options?: CachePageOptions<T>,
): Promise<PageRes<T> | null>;
export async function cachePage<T = unknown>(
  cacheKey: string,
  {
    fun,
    refresh = false,
    ttl,
    kvCache,
    deploymentTarget,
    cacheDir,
    cachePrefix,
  }: CachePageOptions<T> = {},
): Promise<PageRes<T> | null> {
  const cacheEngine = getCacheEngine({ kvCache, deploymentTarget, cacheDir });
  const scopedCacheKey = prefixCacheKey(cacheKey, cachePrefix);

  try {
    if (!refresh) {
      let cached: unknown | null = null;

      try {
        cached = await cacheEngine.getItem(scopedCacheKey);
      } catch (error) {
        console.warn(`Unable to read page cache for key: ${scopedCacheKey}`, error);
      }

      if (isPageRes<T>(cached)) {
        return cached;
      }

      if (cached !== null) {
        console.warn(`Ignoring invalid page cache for key: ${scopedCacheKey}`);
      }
    }

    if (!fun) return null;

    const result = buildSuccess(await fun());

    try {
      await cacheEngine.setItem(scopedCacheKey, result, getSetOptions(ttl));
    } catch (error) {
      console.warn(`Unable to write page cache for key: ${scopedCacheKey}`, error);
    }

    return result;
  } catch (error: any) {
    console.error(error);
    throw error;
  }
}
