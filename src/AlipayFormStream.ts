// import { statSync } from 'node:fs';
import FormStream from 'formstream';

export class AlipayFormStream extends FormStream {
  // 覆盖 file 方法，由于 OpenAPI 文件上传需要强制设置 content-length，所以需要增加一次同步文件 io 来实现此功能
  // https://github.com/node-modules/formstream/blob/master/lib/formstream.js#L119
  // file(name: string, filepath: string, filename: string) {
  //   const size = statSync(filepath).size;
  //   return super.file(name, filepath, filename, size);
  // }
}
