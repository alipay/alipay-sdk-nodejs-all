declare module 'snakecase-keys' {
  interface SnakeCaseKeys {
    (any): any;
  }
  const snakeCaseKeys: SnakeCaseKeys;

  export = snakeCaseKeys;
}

declare module 'camelcase-keys' {
  interface CamelcaseKeys {
    (any, config?: { deep: boolean }): any;
  }
  const camelcaseKeys: CamelcaseKeys;

  export = camelcaseKeys;
}