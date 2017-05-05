import * as joi from 'joi';

import j2s from 'joi-to-swagger';
import { ObjectSchema } from 'joi';
import { Tags } from './index';

export interface ISchema {
  type?: string;
  required?: boolean;
  items?: ISchema;
  $ref?: Function;
}

export const toSwagger = (schema: joi.Schema): any => {
  const swaggerSchema = j2s(schema).swagger;

  if (schema.type === 'array') {
    const itemSchema = schema.$_terms.items[0];
    if (!itemSchema._flags.id) return swaggerSchema;

    return {
      ...swaggerSchema,
      items: { ...swaggerSchema.items, $ref: `#/definitions/${itemSchema._flags.id}` },
      description: schema._flags.description || '',
      required: schema._flags.required || false,
    };
  }

  if (schema.type === 'object') {
    if (!schema._flags.id) return swaggerSchema;

    return {
      $ref: `#/definitions/${schema._flags.id}`,
      description: schema._flags.description || '',
      required: schema._flags.required || false,
    };
  }

  return swaggerSchema;
};

export const toSchema = (joiSchema: ObjectSchema) => {
  return j2s(joiSchema).swagger;
};

export const toJoi = (iSchema: ISchema | joi.Schema): joi.Schema | ISchema => {
  if (joi.isSchema(iSchema)) {
    return iSchema;
  }
  const type = iSchema.type || 'object';
  let schema = null;
  const Ref: any = iSchema.$ref || (iSchema.items && iSchema.items.$ref);
  let keys = {};
  if (Ref) {
    const ref = new Ref();
    keys = { ...ref };
  }

  if (joi[type]) {
    schema = joi[type]();
  }
  if (schema && Ref && Ref[Tags.tagDefinitionDescription]) {
    schema = schema.description(Ref[Tags.tagDefinitionDescription]);
  }
  if (schema && iSchema.required) {
    schema = schema.required();
  }
  switch (type) {
    case 'object':
      return schema ? schema.keys(keys) : null;
    case 'array':
      return schema ? schema.items(keys) : null;
    case 'file':
      return iSchema.required ? joi.object().required() : joi.object();
    default:
      return schema;
  }
};
