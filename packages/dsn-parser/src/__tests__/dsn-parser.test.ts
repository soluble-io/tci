import { parseDsn } from '../dsn-parser';

describe('parseDsn', () => {
  describe('when provided dsn contains all options', () => {
    it('should return the correct parsed params', () => {
      expect(parseDsn('redis://username:password@www.example.com:6379/0')).toStrictEqual({
        success: true,
        value: {
          driver: 'redis',
          pass: 'password',
          host: 'www.example.com',
          user: 'username',
          port: 6379,
          db: '0',
        },
      });
    });
  });
  describe('when provided dsn contains query params', () => {
    it('should return the parsed params and cast bool and numbers', () => {
      const parsed = parseDsn('redis://localhost/0?paramInt=2&paramBool=false&paramStr=hello');
      expect(parsed).toMatchObject({
        success: true,
        value: {
          driver: 'redis',
          host: 'localhost',
          db: '0',
          params: {
            paramInt: 2,
            paramBool: false,
            paramStr: 'hello',
          },
        },
      });
    });
  });

  describe('when provided password contains special characters', () => {
    it('should return the correct parsed params', () => {
      expect(parseDsn('redis://username:P@/ssw/rd@www.example.com:6379/0')).toStrictEqual({
        success: true,
        value: {
          driver: 'redis',
          pass: 'P@/ssw/rd',
          host: 'www.example.com',
          user: 'username',
          port: 6379,
          db: '0',
        },
      });
    });
  });
  describe('when a dsn is provided with missing user', () => {
    it('should return the correct parsed params', () => {
      expect(parseDsn('redis://:password@www.example.com:6379/0')).toStrictEqual({
        success: true,
        value: {
          driver: 'redis',
          pass: 'password',
          host: 'www.example.com',
          port: 6379,
          db: '0',
        },
      });
    });
  });
  describe('when a dsn is provided with no user/pass', () => {
    it('should return the correct parsed params', () => {
      const dsn = 'redis://www.example.com:6379/0';
      expect(parseDsn(dsn)).toStrictEqual({
        success: true,
        value: {
          driver: 'redis',
          host: 'www.example.com',
          port: 6379,
          db: '0',
        },
      });
    });
  });
  describe('when a dsn is provided with host only', () => {
    it('should return the correct parsed params', () => {
      const dsn = 'redis://localhost';
      expect(parseDsn(dsn)).toStrictEqual({
        success: true,
        value: {
          driver: 'redis',
          host: 'localhost',
        },
      });
    });
  });
  describe('when a dsn is provided with host and port only', () => {
    it('should return the correct parsed params', () => {
      const dsn = 'redis://localhost:6379';
      expect(parseDsn(dsn)).toStrictEqual({
        success: true,
        value: {
          driver: 'redis',
          host: 'localhost',
          port: 6379,
        },
      });
    });
  });
  describe('when a dsn is provided with host, port and db only', () => {
    it('should return the correct parsed params', () => {
      const dsn = 'redis://localhost:6379/0';
      expect(parseDsn(dsn)).toStrictEqual({
        success: true,
        value: {
          driver: 'redis',
          host: 'localhost',
          port: 6379,
          db: '0',
        },
      });
    });
  });
  describe('when lowerCaseDriver option is provided', () => {
    it('should lowercase the driver if lowercaseDriver is true', () => {
      const dsn = 'PGSQL://localhost';
      expect(parseDsn(dsn, { lowercaseDriver: true })).toStrictEqual({
        success: true,
        value: {
          driver: 'pgsql',
          host: 'localhost',
        },
      });
    });
    it('should not lowercase the driver if lowercaseDriver is false', () => {
      const dsn = 'PGSQL://localhost';
      expect(parseDsn(dsn, { lowercaseDriver: false })).toStrictEqual({
        success: true,
        value: {
          driver: 'PGSQL',
          host: 'localhost',
        },
      });
    });
    it('should not lowercase the driver if option not provided', () => {
      const dsn = 'PGSQL://localhost';
      expect(parseDsn(dsn, {})).toStrictEqual({
        success: true,
        value: {
          driver: 'PGSQL',
          host: 'localhost',
        },
      });
    });
  });

  //
  describe('when overrides option is provided', () => {
    it('should replace parsed values', () => {
      const dsn = 'redis://username:password@www.example.com:6379/0';
      const overrides = {
        port: 3306,
        db: '2',
        host: 'localhost',
        pass: 'pass',
        user: 'user',
        driver: 'mysql',
      };
      expect(parseDsn(dsn, { overrides })).toStrictEqual({
        success: true,
        value: overrides,
      });
    });
    it('should not allow to clear undefined', () => {
      const dsn = 'redis://username:password@localhost';
      const overrides = {
        pass: undefined,
        user: 'replaced',
      };
      expect(parseDsn(dsn, { overrides })).toStrictEqual({
        success: true,
        value: {
          driver: 'redis',
          host: 'localhost',
          user: 'replaced',
        },
      });
    });
  });

  // ########################################################
  // Errors
  // ########################################################
  describe('when a dsn is not parsable', () => {
    it('should return a PARSE_ERROR', () => {
      expect(parseDsn('redis:///0')).toStrictEqual({
        success: false,
        reason: 'PARSE_ERROR',
        message: 'Cannot parse DSN',
      });
    });
  });
  describe('when a dsn is empty', () => {
    it('should return an EMPTY_DSN reason', () => {
      expect(parseDsn('  ')).toStrictEqual({
        success: false,
        reason: 'EMPTY_DSN',
        message: 'DSN cannot be empty',
      });
    });
  });
  describe('when a dsn is not the right type', () => {
    it('should return an EMPTY_DSN reason', () => {
      expect(parseDsn(([] as unknown) as string)).toStrictEqual({
        success: false,
        reason: 'INVALID_ARGUMENT',
        message: 'DSN must be a string',
      });
    });
  });
  describe('when port is not a valid one', () => {
    it('should return an INVALID_PORT reason', () => {
      expect(parseDsn('pgsql://localhost:12345678')).toStrictEqual({
        success: false,
        reason: 'INVALID_PORT',
        message: 'Invalid port: 12345678',
      });
    });
  });
});
