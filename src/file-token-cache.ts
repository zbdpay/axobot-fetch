import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { type TokenCache, type TokenRecord } from "./types.js";

type TokenCacheFile = Record<string, TokenRecord>;

async function readCache(path: string): Promise<TokenCacheFile> {
  try {
    const content = await readFile(path, "utf8");
    return JSON.parse(content) as TokenCacheFile;
  } catch {
    return {};
  }
}

async function writeCache(path: string, data: TokenCacheFile): Promise<void> {
  const parent = dirname(path);
  await mkdir(parent, { recursive: true });

  const tempPath = `${path}.tmp`;
  await writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  await rename(tempPath, path);
}

function isExpired(expiresAt?: number): boolean {
  if (expiresAt === undefined) {
    return false;
  }
  return expiresAt <= Math.floor(Date.now() / 1000);
}

export class FileTokenCache implements TokenCache {
  readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async get(url: string): Promise<TokenRecord | null> {
    const cache = await readCache(this.filePath);
    const token = cache[url];

    if (!token) {
      return null;
    }

    if (isExpired(token.expiresAt)) {
      delete cache[url];
      await writeCache(this.filePath, cache);
      return null;
    }

    return token;
  }

  public async set(url: string, token: TokenRecord): Promise<void> {
    const cache = await readCache(this.filePath);
    cache[url] = token;
    await writeCache(this.filePath, cache);
  }

  public async delete(url: string): Promise<void> {
    const cache = await readCache(this.filePath);
    delete cache[url];
    await writeCache(this.filePath, cache);
  }
}
