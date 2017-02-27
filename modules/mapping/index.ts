import { Optional, of, absent } from 'optional';

export interface Constructor<T> {
  new (values: { [s: string]: any }): T;

  /**
   * Access prototype.
   */
  prototype: any;
}

export interface Target {
  /**
   * Supports lookups.
   */
  [key: string]: any;
}

export interface Field<T> {
  optional: boolean;

  decode(value: any, path: Path): T;

  encode(value: T, path: Path): any;

  equals(a: T, b: T): boolean;
}

class Path {
  readonly name: string | null;
  readonly parent?: Path;

  constructor(name: string | null, parent?: Path) {
    this.name = name;
    this.parent = parent;
  }

  public extend(name: string): Path {
    return new Path(name, this);
  }

  public error(message: string): Error {
    return new Error(this.formatPath() + ": " + message);
  }

  private formatPath(): string {
    const full: string[] = [];

    var current: Path = this;

    while (current) {
      if (current.name === null) {
        full.push("object");
        break;
      }

      if (current.name[0] === "[") {
        full.push(current.name);
      } else {
        full.push(`.${current.name}`);
      }

      current = current.parent;
    }

    return full.reverse().join("");
  }
}

class AssignField implements Field<any> {
  public static __field = true;

  readonly optional: boolean;

  constructor(optional: boolean) {
    this.optional = optional;
  }

  public decode(value: any): any {
    return value;
  }

  public encode(value: any): any {
    return value;
  }

  public equals(a: any, b: any): boolean {
    return a === b;
  }
}

export type ToField<T> = Field<T> | Constructor<T>;

function toField<T>(argument: ToField<T>, optional: boolean): Field<T> {
  if (argument.constructor && (argument.constructor as any).__field) {
    return argument as Field<T>;
  }

  return new ClassField<T>(argument as Constructor<T>, optional);
}

interface TypeMapping<T> {
  type: string;
  target: ToField<T>;
}

interface HasType {
  type: string;
}

export class TypeField<T extends Target> implements Field<T> {
  public static __field = true;

  readonly typeFunction: (input: T) => string;
  readonly types: { [s: string]: Field<any> };
  readonly optional: boolean;

  /**
   * Build a simplified type mapping.
   */
  static of<U>(types: (HasType & ToField<U>)[]): TypeField<U> {
    return new TypeField<U>(
      input => (<any>input).constructor.type,
      types.map(t => {
        return {type: t.type, target: t} as TypeMapping<U>;
      })
    );
  }

  constructor(typeFunction: (input: T) => string, types: TypeMapping<any>[], options?: { optional?: boolean }) {
    const mapTypes: { [s: string]: Field<any> } = {};
    const {optional}: { optional?: boolean } = (options || {});

    types.forEach(type => {
      mapTypes[type.type] = toField(type.target, false);
    })

    this.typeFunction = typeFunction;
    this.types = mapTypes;
    this.optional = !!optional;
  }

  public decode(value: any, path: Path): T {
    const type = value['type'];

    if (!type) {
      throw path.error("missing field: type");
    }

    const sub = this.types[type];

    if (!sub) {
      throw path.error("does not correspond to a sub-type: " + type);
    }

    return sub.decode(value, path);
  }

  public encode(value: T, path?: Path): any {
    const type = this.typeFunction(value);
    const sub = this.types[type];

    if (!sub) {
      const expected = Object.keys(this.types).join(", ");
      throw path.error(`does not correspond to a sub-type: ${type}, expected one of: ${expected}`);
    }

    const values = sub.encode(value, path);
    values["type"] = type;
    return values;
  }

  public equals(a: T, b: T): boolean {
    if (a.constructor.prototype !== b.constructor.prototype) {
      return false;
    }

    return equals(a, b);
  }
}

export class ArrayField<T extends Target> implements Field<Array<T>> {
  public static __field = true;

  readonly field: Field<T>;
  readonly optional: boolean;

  constructor(field: ToField<T>, optional?: boolean) {
    this.field = toField(field, !!optional);
    this.optional = !!optional;
  }

  public decode(value: any, path: Path): Array<T> {
    if (!(value instanceof Array)) {
      throw path.error("expected array, got: " + String(value));
    }

    return value.map((v: any, index: number) => {
      return this.field.decode(v, path.extend(`[${index}]`));
    });
  }

  public encode(value: Array<T>, path: Path): any {
    return value.map((v: any, index: number) => {
      return this.field.encode(v, path.extend(`[${index}]`));
    });
  }

  public equals(a: Array<T>, b: Array<T>): boolean {
    if (a.length !== b.length) {
      return false;
    }

    return a.every((value, index) => {
      return this.field.equals(value, b[index]);
    });
  }
}

export class ClassField<T extends Target> implements Field<T> {
  public static __field = true;

  readonly con: Constructor<T>;
  readonly optional: boolean;

  constructor(con: Constructor<T>, optional?: boolean) {
    this.con = con;
    this.optional = !!optional;
  }

  public decode(input: any, path: Path): T {
    if (!(input instanceof Object)) {
      throw path.error(`expected object, got: ${input}`);
    }

    const values: { [s: string]: any } = {};

    const fields = this.con.prototype.__fields as { [s: string]: Field<any> } || {};

    Object.keys(fields).forEach(key => {
      const field = fields[key];
      const value = input[key];

      if (value === undefined || value == null) {
        if (!field.optional) {
          throw path.extend(key).error("missing value");
        } else {
          values[key] = absent<any>();
        }
      }

      if (field.optional) {
        values[key] = of(field.decode(value, path.extend(key)));
      } else {
        values[key] = field.decode(value, path.extend(key));
      }
    });

    return new this.con(values);
  }

  public encode(input: T, path: Path): any {
    const values: { [s: string]: any } = {};
    const proto = this.con.prototype;
    const fields = proto.__fields as { [s: string]: Field<any> } || {};

    Object.keys(fields).forEach(key => {
      const field = fields[key];
      const value = input[key];

      if (field.optional) {
        (value as Optional<any>).accept(value => {
          values[key] = field.encode(value, path.extend(key));
        });
      } else {
        values[key] = field.encode(value, path.extend(key));
      }
    });

    return values;
  }

  public equals(a: T, b: T): boolean {
    return equals(a, b);
  }
}

export function equals<T extends Target>(a: T, b: T): boolean {
  if (a === null || b === null) {
    return a === b;
  }

  if (a === undefined || b === undefined) {
    return a === b;
  }

  /* required check to guarantee same prototype */
  if (a.constructor !== b.constructor) {
    return false;
  }

  const proto = a.constructor.prototype;
  const fields = proto.__fields as { [s: string]: Field<any> } || {};

  return Object.keys(fields).every(key => {
    return fields[key].equals(a[key], b[key]);
  });
}

export function field(options?: { type?: ToField<any>, optional?: boolean }): any {
  const {type, optional}: { type?: ToField<any>, optional?: boolean } = options || {};

  return function (target: any, fieldKey: any) {
    const fields: { [s: string]: Field<any> } = target.__fields = target.__fields || {};
    fields[fieldKey] = type && toField(type, !!optional) || new AssignField(!!optional);
  };
}

export function decode<T>(input: any, type: ToField<T>): T {
  const p: Path = new Path(null);
  return toField(type, false).decode(input, p);
}

export function encode<T extends Target>(input: T, type?: ToField<T>): { [s: string]: any } {
  const p: Path = new Path(null);
  return (type && toField(type, false) || toField((<any>input).constructor as Constructor<T>, false)).encode(input, p);
}

/**
 * Perform a shallow clone of the given object.
 */
export function clone<T extends Target, K extends keyof T>(input: T, overrides?: Pick<T, K>): T {
  const values: { [s: string]: any } = {};

  const constructor = (<any>input).constructor;
  const proto = constructor.prototype;
  const fields: { [s: string]: Field<any> } = proto.__fields || {};

  Object.keys(fields).forEach(key => {
    values[key] = input[key];
  });

  /* assign specified overrides */
  if (overrides) {
    Object.keys(overrides).forEach(key => {
      if (fields[key] === undefined) {
        throw new Error(String(constructor.name) + ": field does not exist: " + key);
      }

      values[key] = overrides[key];
    });
  }

  return new constructor(values);
}

export function mutate<T extends Target, K extends keyof T>(input: T, overrides: Pick<T, K>): T {
  const constructor = (<any>input).constructor;
  const proto = constructor.prototype;
  const fields: { [s: string]: Field<any> } = proto.__fields || {};

  Object.keys(overrides).forEach(key => {
    if (fields[key] === undefined) {
      throw new Error(String(constructor.name) + ": field does not exist: " + key);
    }

    input[key] = overrides[key];
  });

  return input;
}
