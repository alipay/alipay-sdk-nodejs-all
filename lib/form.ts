/**
 * @author tudou527
*/
import * as isJSON from 'is-json';

export interface IFile {
  name: string;
  path: string;
  fieldName: string;
}
export interface IField {
  name: string;
  value: string | object;
}

class AliPayForm {
  private method: 'get' | 'post';
  public files: IFile[];
  public fields: IField[];

  constructor() {
    this.fields = [];
    this.files = [];
    this.method = 'post';
  }

  getFields() { return this.fields; }
  getFiles() { return this.files; }
  getMethod() { return this.method; }

  /**
   * 设置 method
   * post、get 的区别在于 post 会返回 form 表单，get 返回 url
   */
  setMethod(method: 'get' | 'post') {
    this.method = method;
  }

  /**
   * 增加字段
   * @param fieldName 字段名
   * @param fieldValue 字段值
   */
  addField(fieldName: string, fieldValue: any | object) {
    if (isJSON(fieldValue)) {
      // 当 fieldValue 为 json 字符串时，解析出 json
      this.fields.push({ name: fieldName, value: JSON.parse(fieldValue) });
    } else {
      this.fields.push({ name: fieldName, value: fieldValue });
    }
  }

  /**
   * 增加文件
   * @param fieldName 文件字段名
   * @param fileName 文件名
   * @param filePath 文件绝对路径
   */
  addFile(fieldName: string, fileName: string, filePath: string) {
    this.files.push({
      fieldName,
      name: fileName,
      path: filePath,
    });
  }
}

exports = module.exports = AliPayForm;
Object.defineProperty(exports, '__esModule', { value: true });

export default AliPayForm;
