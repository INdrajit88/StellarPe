import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

describe('env validation module', () => {
  const ORIGINAL_ENV = process.env;
  let exitSpy: ReturnType<typeof jest.spyOn>;
  let errorSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    // Reset module cache so env.ts re-runs validateEnv on each import
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as unknown as (code?: number) => never);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function setAllRequired() {
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-32-chars-long!!!';
    process.env.STELLAR_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
  }

  it('exports validated env when all required variables are set', async () => {
    setAllRequired();
    process.env.HORIZON_URL = 'https://custom-horizon.example.com';

    const { env } = await import('@/lib/env');

    expect(env.DATABASE_URL).toBe('postgresql://localhost:5432/test');
    expect(env.JWT_SECRET).toBe('test-jwt-secret');
    expect(env.ENCRYPTION_MASTER_KEY).toBe('test-master-key-32-chars-long!!!');
    expect(env.STELLAR_NETWORK_PASSPHRASE).toBe('Test SDF Network ; September 2015');
    expect(env.HORIZON_URL).toBe('https://custom-horizon.example.com');
  });

  it('defaults HORIZON_URL to testnet when not provided', async () => {
    setAllRequired();
    delete process.env.HORIZON_URL;

    const { env } = await import('@/lib/env');

    expect(env.HORIZON_URL).toBe('https://horizon-testnet.stellar.org');
  });

  it('logs error and exits when DATABASE_URL is missing', async () => {
    setAllRequired();
    delete process.env.DATABASE_URL;

    await expect(import('@/lib/env')).rejects.toThrow('process.exit called');

    expect(errorSpy).toHaveBeenCalledWith(
      'Missing required environment variable: DATABASE_URL'
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('logs error and exits when JWT_SECRET is missing', async () => {
    setAllRequired();
    delete process.env.JWT_SECRET;

    await expect(import('@/lib/env')).rejects.toThrow('process.exit called');

    expect(errorSpy).toHaveBeenCalledWith(
      'Missing required environment variable: JWT_SECRET'
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('logs error and exits when ENCRYPTION_MASTER_KEY is missing', async () => {
    setAllRequired();
    delete process.env.ENCRYPTION_MASTER_KEY;

    await expect(import('@/lib/env')).rejects.toThrow('process.exit called');

    expect(errorSpy).toHaveBeenCalledWith(
      'Missing required environment variable: ENCRYPTION_MASTER_KEY'
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('logs error and exits when STELLAR_NETWORK_PASSPHRASE is missing', async () => {
    setAllRequired();
    delete process.env.STELLAR_NETWORK_PASSPHRASE;

    await expect(import('@/lib/env')).rejects.toThrow('process.exit called');

    expect(errorSpy).toHaveBeenCalledWith(
      'Missing required environment variable: STELLAR_NETWORK_PASSPHRASE'
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('logs all missing variables when multiple are absent', async () => {
    // Set none of the required variables
    delete process.env.DATABASE_URL;
    delete process.env.JWT_SECRET;
    delete process.env.ENCRYPTION_MASTER_KEY;
    delete process.env.STELLAR_NETWORK_PASSPHRASE;

    await expect(import('@/lib/env')).rejects.toThrow('process.exit called');

    expect(errorSpy).toHaveBeenCalledWith(
      'Missing required environment variable: DATABASE_URL'
    );
    expect(errorSpy).toHaveBeenCalledWith(
      'Missing required environment variable: JWT_SECRET'
    );
    expect(errorSpy).toHaveBeenCalledWith(
      'Missing required environment variable: ENCRYPTION_MASTER_KEY'
    );
    expect(errorSpy).toHaveBeenCalledWith(
      'Missing required environment variable: STELLAR_NETWORK_PASSPHRASE'
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('treats empty string as missing for required variables', async () => {
    setAllRequired();
    process.env.JWT_SECRET = '';

    await expect(import('@/lib/env')).rejects.toThrow('process.exit called');

    expect(errorSpy).toHaveBeenCalledWith(
      'Missing required environment variable: JWT_SECRET'
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
