import FormStream from 'formstream';

export interface AlipayFormStreamOptions {
  /** min chunk size to emit data event */
  minChunkSize?: number;
}

export class AlipayFormStream extends FormStream {
  constructor(options?: AlipayFormStreamOptions) {
    super({
      // set default minChunkSize to 2MB
      minChunkSize: 1024 * 1024 * 2,
      ...options,
    });
  }
}
