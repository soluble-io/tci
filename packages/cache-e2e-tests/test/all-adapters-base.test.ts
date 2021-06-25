import {
  CacheException,
  CacheInterface,
  CacheProviderException,
  Guards,
  InvalidCacheKeyException,
  MapCacheAdapter,
} from '@soluble/cache-interop';
import { IoRedisCacheAdapter } from '@soluble/cache-ioredis';
import { RedisCacheAdapter } from '@soluble/cache-redis';
import { E2eDockerContainers } from '../config/docker-container.config';

const sleep = async (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const adapters = [
  ['MapCacheAdapter', () => new MapCacheAdapter()],
  [
    'IoRedisCacheAdapter/Redis5',
    async () => {
      const { dsn } = await E2eDockerContainers.getContainer('redis5');
      return new IoRedisCacheAdapter({
        connection: dsn,
      });
    },
  ],
  [
    'IoRedisCacheAdapter/Redis6',
    async () => {
      const { dsn } = await E2eDockerContainers.getContainer('redis6');
      return new IoRedisCacheAdapter({
        connection: dsn,
      });
    },
  ],
  [
    'RedisCacheAdapter/Redis5',
    async () => {
      const { dsn } = await E2eDockerContainers.getContainer('redis5');
      return new RedisCacheAdapter({
        connection: dsn,
      });
    },
  ],
  [
    'RedisCacheAdapter/Redis6',
    async () => {
      const { dsn } = await E2eDockerContainers.getContainer('redis6');
      return new RedisCacheAdapter({
        connection: dsn,
      });
    },
  ],
] as [name: string, factory: () => CacheInterface | Promise<CacheInterface>][];

describe.each(adapters)('Adapter: %s', (name, adapterFactory) => {
  let cache: CacheInterface;
  beforeAll(async () => {
    cache = await adapterFactory();
  });
  afterAll(async () => {
    if (Guards.isConnectedCache(cache)) {
      await cache.getConnection().quit();
    }
  });
  afterEach(async () => {
    await cache.clear();
  });
  /**
   * ##############################################################
   * # Adapter.set() basic behaviour                             #
   * ##############################################################
   */
  describe('Adapter.set() basics', () => {
    describe('when setting a string value', () => {
      it('should return true', async () => {
        expect(await cache.set('k', 'cool')).toStrictEqual(true);
      });
      it('should persist the value', async () => {
        await cache.set('k2', 'cool2');
        expect((await cache.get('k2')).data).toStrictEqual('cool2');
      });
    });
    describe('when setting a null value', () => {
      it('should return true', async () => {
        expect(await cache.set('k', null)).toStrictEqual(true);
      });
      it('should persist the value', async () => {
        await cache.set('k2', null);
        expect((await cache.get('k2')).data).toBeNull();
      });
    });
    describe('when disableCache is true', () => {
      it('should not persist entry and return false', async () => {
        expect(
          await cache.set('k', 'cool', {
            disableCache: true,
          })
        ).toStrictEqual(false);
        expect((await cache.get('k')).data).toStrictEqual(null);
      });
      it('should not execute the function provider', async () => {
        const fct = jest.fn((_) => 'cool');
        await cache.set('k', 'cool', {
          disableCache: true,
        });
        expect(fct).toHaveBeenCalledTimes(0);
      });
    });

    describe('when value is a function returning a string', () => {
      it('should call the function and return true', async () => {
        const fct = jest.fn((_) => 'cool');
        expect(await cache.set('k', fct)).toStrictEqual(true);
        expect(fct).toHaveBeenCalledTimes(1);
      });
      it('should persist the value', async () => {
        const fct = jest.fn((_) => 'cool');
        await cache.set('k2', fct);
        expect((await cache.get('k2')).data).toStrictEqual('cool');
      });
    });
    describe('when value is a function returning null', () => {
      it('should call the function and return true', async () => {
        const fct = jest.fn((_) => 'cool');
        expect(await cache.set('k', fct)).toStrictEqual(true);
        expect(fct).toHaveBeenCalledTimes(1);
      });
      it('should persist the value', async () => {
        const fct = jest.fn((_) => null);
        await cache.set('k2', fct);
        expect((await cache.get('k2')).data).toBeNull();
      });
    });
    describe('when function throws', () => {
      it('should return a CacheProviderException when function throws', async () => {
        const fct = jest.fn((_) => {
          throw new Error('error');
        });
        const ret = await cache.set('k', fct);
        expect(fct).toHaveBeenCalledTimes(1);
        expect(ret).toBeInstanceOf(CacheProviderException);
        expect((ret as CacheProviderException).message).toMatch('cooooo');
      });
    });

    describe('when value is a native async function', () => {
      it('should call the function with params and return true', async () => {
        const fct = jest.fn(async (_) => 'native');
        expect(await cache.set('k', fct)).toStrictEqual(true);
        expect(fct).toHaveBeenCalledTimes(1);
      });
    });

    describe('when value is an async function that throws', () => {
      it('should return a CacheProviderException when promise fails', async () => {
        const fct = jest.fn(async (_) => {
          throw new Error('fetch-error');
        });
        const ret = await cache.set('k', fct);
        expect(fct).toHaveBeenCalledTimes(1);
        expect(ret).toBeInstanceOf(CacheException);
      });
    });
  });

  /**
   * ##############################################################
   * # Adapter.get() behaviour                                   #
   * ##############################################################
   */
  describe('Adapter.get()', () => {
    describe('when value is not in cache', () => {
      it('should return empty non-error cacheitem', async () => {
        expect(await cache.get('k')).toMatchObject({
          isSuccess: true,
          isHit: false,
          error: undefined,
          data: null,
          metadata: {
            key: 'k',
          },
        });
      });
    });
    describe('when value is in cache', () => {
      it('should return cacheitem with data', async () => {
        await cache.set('k', 'hello');
        expect(await cache.get('k')).toMatchObject({
          isSuccess: true,
          isHit: true,
          data: 'hello',
        });
      });
    });
    describe('when a defaultValue is given', () => {
      it('should return defaultValue if nothing in cache', async () => {
        expect(await cache.get('k', { defaultValue: 'default' })).toMatchObject({
          isHit: false,
          data: 'default',
        });
      });
      it('should give priority to existing cache entry', async () => {
        await cache.set('k', 'initial');
        expect(await cache.get('k', { defaultValue: 'default' })).toMatchObject({
          isHit: true,
          data: 'initial',
        });
      });
    });
    describe('when an item was set with 0 expiry (forever)', () => {
      it('should always return a cache hit', async () => {
        await cache.set('k', 'hello world', { ttl: 0 });
        expect(await cache.get('k')).toMatchObject({
          isHit: true,
          data: 'hello world',
        });
      });
    });
    describe('when an item was set with 1 second expiry', () => {
      it('should always return a cache miss if a second has passed', async () => {
        await cache.set('k', 'hello world', { ttl: 1 });
        await sleep(1001);
        expect(await cache.get('k')).toMatchObject({
          isSuccess: true,
          isHit: false,
          data: null,
        });
      });
    });

    describe('when disableCache is true', () => {
      describe('when no defaultValue provided', () => {
        it('should never return the cache entry', async () => {
          await cache.set('k', 'cool');
          expect(
            await cache.get('k', {
              disableCache: true,
            })
          ).toMatchObject({
            isSuccess: true,
            isHit: false,
            data: null,
            error: undefined,
          });
        });
      });
      describe('when defaultValue value is provided', () => {
        it('should never return the default', async () => {
          await cache.set('k', 'cool');
          expect(
            await cache.get('k', {
              defaultValue: 'default',
              disableCache: true,
            })
          ).toMatchObject({
            isSuccess: true,
            isHit: false,
            data: 'default',
          });
        });
      });
    });
  });

  /**
   * ##############################################################
   * # Adapter.delete() behaviour                                   #
   * ##############################################################
   */
  describe('Adapter.delete()', () => {
    describe('when value is not in cache', () => {
      it('should return false', async () => {
        expect(await cache.delete('no_existing')).toStrictEqual(false);
      });
    });
    describe('when value is in cache', () => {
      it('should return true and delete the entry', async () => {
        await cache.set('k', 'cool');
        expect((await cache.get('k')).data).toStrictEqual('cool');
        expect(await cache.delete('k')).toStrictEqual(true);
        expect((await cache.get('k')).data).toStrictEqual(null);
      });
    });
    describe('when disableCache is set to true', () => {
      describe('when an item exists', () => {
        it('should no delete it and return false', async () => {
          await cache.set('k', 'hello');
          const ret = await cache.delete('k', {
            disableCache: true,
          });
          expect(ret).toStrictEqual(false);
          expect((await cache.get('k')).data).toStrictEqual('hello');
        });
        describe('when no item exists', () => {
          it('should return false', async () => {
            const ret = await cache.delete('k', {
              disableCache: true,
            });
            expect(ret).toStrictEqual(false);
          });
        });
      });
      it('should always return false whether the item exists or not', async () => {
        expect(
          await cache.has('k', {
            disableCache: true,
          })
        ).toStrictEqual(false);
        await cache.set('k', 'hello world');
        expect(
          await cache.has('k', {
            disableCache: true,
          })
        ).toStrictEqual(false);
      });
    });
  });

  /**
   * ##############################################################
   * # Adapter.clear() behaviour                                   #
   * ##############################################################
   */
  describe('Adapter.clear()', () => {
    describe('when no value is in cache', () => {
      it('should return true', async () => {
        expect(await cache.clear()).toStrictEqual(true);
      });
    });
    describe('when some values are in cache', () => {
      it('should return true and delete the values', async () => {
        await cache.setMultiple([
          ['k1', 'val1'],
          ['k2', 'val2'],
        ]);
        expect((await cache.getMultiple(['k1', 'k2'])).size).toStrictEqual(2);
        expect(await cache.clear()).toStrictEqual(true);
        expect((await cache.get('k1')).data).toBeNull();
        expect((await cache.get('k2')).data).toBeNull();
      });
    });
  });

  /**
   * ##############################################################
   * # Adapter.has() behaviour                                   #
   * ##############################################################
   */
  describe('Adapter.has()', () => {
    describe('when value is not in cache', () => {
      it('should return false', async () => {
        expect(await cache.has('not_exist')).toStrictEqual(false);
      });
    });
    describe('when value is in cache', () => {
      it('should return true', async () => {
        await cache.set('k', 'cool');
        expect(await cache.has('k')).toStrictEqual(true);
      });
    });
    describe('when an item was set with 0 expiry (forever)', () => {
      it('should always return true', async () => {
        await cache.set('k', 'hello world', { ttl: 0 });
        expect(await cache.has('k')).toStrictEqual(true);
      });
    });
    describe('when an item was set with 1 second expiry', () => {
      it('should return false if a second has passed', async () => {
        await cache.set('k', 'hello world', { ttl: 1 });
        await sleep(1001);
        expect(await cache.has('k')).toStrictEqual(false);
      });
    });
    describe('when disableCache is set to true', () => {
      it('should always return false whether the item exists or not', async () => {
        expect(
          await cache.has('k', {
            disableCache: true,
          })
        ).toStrictEqual(false);
        await cache.set('k', 'hello world');
        expect(
          await cache.has('k', {
            disableCache: true,
          })
        ).toStrictEqual(false);
      });
    });
  });

  /**
   * ##############################################################
   * # Adapter.deleteMultiple() behaviour                                   #
   * ##############################################################
   */
  describe('Adapter.deleteMultiple()', () => {
    it('should return a Map with key and boolean', async () => {
      await cache.set('key-exists', 'cool');
      const resp = await cache.deleteMultiple(['key-exists', 'no1']);
      expect(resp).toStrictEqual<any>(
        new Map([
          ['key-exists', true],
          ['no1', false],
        ])
      );
    });
    describe('when disableCache is set to true', () => {
      it('should return a Map with key and false', async () => {
        await cache.set('key-exists', 'cool');
        const resp = await cache.deleteMultiple(['key-exists', 'no1'], {
          disableCache: true,
        });
        expect(resp).toStrictEqual<any>(
          new Map([
            ['key-exists', false],
            ['no1', false],
          ])
        );
      });
    });
  });

  /**
   * ##############################################################
   * # Adapter.setMultiple() behaviour                                   #
   * ##############################################################
   */
  describe('Adapter.setMultiple()', () => {
    describe('when keyVals are valid', () => {
      it('should return a map with key/true', async () => {
        const fnAsyncOk = jest.fn(async (_) => 'async');
        const fnOk = jest.fn(() => 'sync');
        const ret = await cache.setMultiple([
          ['k-string', 'hello'],
          ['k-null', null],
          ['k-fn-ok', fnOk],
          ['k-async-ok', fnAsyncOk],
        ]);
        expect(ret).toStrictEqual<any>(
          new Map([
            ['k-string', true],
            ['k-null', true],
            ['k-fn-ok', true],
            ['k-async-ok', true],
          ])
        );
        expect((await cache.get('k-string')).data).toStrictEqual('hello');
        expect((await cache.get('k-null')).data).toStrictEqual(null);
        expect((await cache.get('k-fn-ok')).data).toStrictEqual('sync');
        expect((await cache.get('k-async-ok')).data).toStrictEqual('async');
      });
    });
    describe('when keyVals throws errors', () => {
      it('should return a map with key/CacheException', async () => {
        const fnAsyncErr = jest.fn(async (_) => {
          throw new Error('error');
        });
        const fnErr = jest.fn(() => {
          throw new Error('error');
        });
        const ret = await cache.setMultiple([
          ['k-string', 'hello'],
          ['k-fn-err', fnErr],
          ['k-async-err', fnAsyncErr],
        ]);
        expect(ret.get('k-string')).toStrictEqual(true);
        expect(ret.get('k-fn-err')).toBeInstanceOf(CacheProviderException);
        expect(ret.get('k-async-err')).toBeInstanceOf(CacheProviderException);
        expect((await cache.get('k-string')).data).toStrictEqual('hello');
        expect((await cache.get('k-fn-err')).data).toStrictEqual(null);
        expect((await cache.get('k-async-err')).data).toStrictEqual(null);
      });
      describe('when ttl option is given', () => {
        it('should set ttl so entries will be discarded', async () => {
          await cache.setMultiple([['k', 'hello']], {
            ttl: 1,
          });
          expect((await cache.get('k')).data).toStrictEqual('hello');
          await sleep(1001);
          expect(await cache.get('k')).toMatchObject({
            isSuccess: true,
            isHit: false,
            data: null,
          });
        });
      });
      describe('when disableCache is true', () => {
        it('should not persist entry and return false', async () => {
          const ret = await cache.setMultiple(
            [
              ['k1', 'hello'],
              ['k2', 'cool'],
            ],
            {
              disableCache: true,
            }
          );
          expect(ret.get('k1')).toStrictEqual(false);
          expect(ret.get('k2')).toStrictEqual(false);
          expect((await cache.get('k1')).data).toStrictEqual(null);
          expect((await cache.get('k2')).data).toStrictEqual(null);
        });
        it('should never execute function provider', async () => {
          const fn = jest.fn(async (_) => 'cool');
          await cache.setMultiple([['k', fn]], {
            disableCache: true,
          });
          expect(fn).toHaveBeenCalledTimes(0);
        });
      });
    });
  });

  /**
   * ##############################################################
   * # Adapter.getMultiple() behaviour                                   #
   * ##############################################################
   */
  describe('Adapter.getMultiple()', () => {
    describe('when some cache entries exists', () => {
      it('should only return existing keys', async () => {
        await cache.set('key1', 'val1');
        await cache.setMultiple([['key2', 'val2']]);
        const resp = await cache.getMultiple(['key1', 'key2', 'key-not-exists']);
        expect(resp.size).toBe(3);
        expect(resp.get('key1')?.data).toStrictEqual('val1');
        expect(resp.get('key2')?.data).toStrictEqual('val2');
        expect(resp.get('key-not-exists')?.data).toBeNull();
      });
    });
    describe('when some entries exists and defaultValue is provided', () => {
      it('should return existing keys and set the defaults to others', async () => {
        await cache.set('key1', 'val1');
        await cache.setMultiple([['key2', 'val2']]);
        const resp = await cache.getMultiple(['key1', 'key2', 'key-not-exists'], {
          defaultValue: 'the_default_value',
        });
        expect(resp.size).toBe(3);
        expect(resp.get('key1')?.data).toStrictEqual('val1');
        expect(resp.get('key2')?.data).toStrictEqual('val2');
        expect(resp.get('key-not-exists')?.data).toStrictEqual('the_default_value');
      });
    });
    describe('when disableCache is set to true', () => {
      it('should return null but respect defaultValue', async () => {
        await cache.set('key1', 'val1');
        await cache.setMultiple([['key2', 'val2']]);
        const resp = await cache.getMultiple(['key1', 'key2', 'key-not-exists'], {
          defaultValue: 'the_default_value',
          disableCache: true,
        });
        expect(resp.size).toBe(3);
        expect(resp.get('key1')?.data).toStrictEqual('the_default_value');
        expect(resp.get('key2')?.data).toStrictEqual('the_default_value');
        expect(resp.get('key-not-exists')?.data).toStrictEqual('the_default_value');
      });
    });
  });

  /**
   * ##############################################################
   * # Adapter.getOrSet() behaviour                                   #
   * ##############################################################
   */
  describe('Adapter.getOrSet', () => {
    describe('when key is not in cache', () => {
      it('should execute the function and persist its return value', async () => {
        const fct = jest.fn(async (_) => 'hello');
        expect(await cache.getOrSet('k', fct)).toMatchObject({
          isSuccess: true,
          isHit: false,
          isPersisted: true,
          data: 'hello',
          error: undefined,
          metadata: {
            key: 'k',
          },
        });
        expect(fct).toHaveBeenCalledTimes(1);
        expect((await cache.get('k')).data).toStrictEqual('hello');
      });
    });
    describe('when key is already in cache', () => {
      it('should not execute the function provider and return the entry', async () => {
        const fct = jest.fn(async (_) => 'value_from_promise');
        await cache.set('k', 'initial_value');
        expect(await cache.getOrSet('k', fct)).toMatchObject({
          isHit: true,
          isPersisted: null,
          data: 'initial_value',
        });
        expect(fct).toHaveBeenCalledTimes(0);
      });
    });

    describe('when disableCache is set to true (read/write)', () => {
      describe('when a cache entry exists', () => {
        it('should execute the fn but ignore cache in read / write', async () => {
          const fct = jest.fn(async (_) => 'from_promise');
          await cache.set('k', 'initial_value');
          expect(
            await cache.getOrSet('k', fct, {
              disableCache: true,
            })
          ).toMatchObject({
            isSuccess: true,
            isHit: false,
            isPersisted: false,
            data: 'from_promise',
            error: undefined,
          });
          expect(fct).toHaveBeenCalledTimes(1);
          expect((await cache.get('k')).data).toStrictEqual('initial_value');
        });
      });
    });
  });

  /**
   * ##############################################################
   * # Check for invalid cache key
   * ##############################################################
   */
  describe('InvalidCacheKeys', () => {
    const key = ({ errKey: true } as unknown) as string;
    describe('For set(), get() and delete()', () => {
      it('should return InvalidCacheKeyException', async () => {
        await expect(cache.delete(key)).resolves.toBeInstanceOf(InvalidCacheKeyException);
        await expect(cache.set(key, 'cool')).resolves.toBeInstanceOf(InvalidCacheKeyException);
        await expect(cache.delete(key)).resolves.toBeInstanceOf(InvalidCacheKeyException);
      });
    });
    describe('For has() method', () => {
      it('should return undefined', async () => {
        await expect(cache.has(key)).resolves.toStrictEqual(undefined);
      });
      it('should call onError', async () => {
        const fn = jest.fn();
        cache.has(key, {
          onError: fn,
        });
        expect(fn).toHaveBeenCalledTimes(1);
      });
    });
  });
});
