// forked form https://github.com/joaquimserafim/is-json/blob/master/index.js#L6
function isJSONString(value: any) {
  if (typeof value !== 'string') return false;
  value = value.replace(/\s/g, '').replace(/\n|\r/, '');
  if (/^\{(.*?)\}$/.test(value)) {
    return /"(.*?)":(.*?)/g.test(value);
  }

  if (/^\[(.*?)\]$/.test(value)) {
    return value.replace(/^\[/, '')
      .replace(/\]$/, '')
      .replace(/},{/g, '}\n{')
      .split(/\n/)
      .map((s: string) => { return isJSONString(s); })
      .reduce(function(_prev: string, curr: string) { return !!curr; });
  }
  return false;
}

export interface IFile {
  /** 文件名 */
  name: string;
  /** 文件路径 */
  path: string;
  /** 表单字段名 */
  fieldName: string;
}

export interface IField {
  name: string;
  value: string | object;
}

export class AlipayFormData {
  private method: string;
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
  setMethod(method: string) {
    this.method = method.toLowerCase();
  }

  /**
   * 增加字段
   * @param fieldName 字段名
   * @param fieldValue 字段值
   */
  addField(fieldName: string, fieldValue: any) {
    if (isJSONString(fieldValue)) {
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
