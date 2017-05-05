import * as _ from 'lodash';
import Router from 'koa-router';
import glob from 'glob';

import { koaSwagger } from 'koa2-swagger-ui';
import joi, { ObjectSchema } from 'joi';
import { toSchema } from './ischema';
import { basename, join, parse } from 'path';

export * from './controller';

export * from './description';

export * from './ischema';

export * from './method';

export * from './parameter';

export * from './resolvers';

export * from './response';

export * from './summary';

export * from './tag';

export interface ISwagger {
  swagger: string;
  info: {
    description?: string;
    version: string;
    title: string;
    termsOfService?: string;
    concat?: {
      email: string;
    };
    license?: {
      name: string;
      url: string;
    };
  };
  basePath?: string;
  tags?: Array<{
    name: string;
    description?: string;
    externalDocs?: {
      description: string;
      url: string;
    };
  }>;
  autoImportControllers?: {
    globPath: string;
  };
  autoImportSchemas?: {
    globPath: string;
  };
  paths: {};
  definitions: {};
}

export interface IPath {
  tags: string[];
  summary: string;
  description: string;
  operationId: string;
  consumes: string[];
  produces: string[];
  parameters?: Array<{}>;
  responses: {};
  security: Array<{}>;
}

export const DEFAULT_SWAGGER: ISwagger = {
  basePath: '',
  definitions: {},
  info: {
    title: 'Swagger UI',
    version: '1.0.0',
  },
  paths: {},
  swagger: '2.0',
};

export enum HTTPStatusCodes {
  success = 200,
  internalServerError = 500,
  created = 201,
  other = 303,
  badRequest = 400,
}

export enum Tags {
  tagController = 'Controller',
  tagDefinitionDescription = 'DefinitionDescription',
  tagDefinitionName = 'DefinitionName',
  tagDescription = 'Description',
  tagGlobalMethod = 'GlobalMethod',
  tagMethod = 'Method',
  tagMiddleMethod = 'MiddleMethod',
  tagMiddleWare = 'MiddleWare',
  tagParameter = 'Parameter',
  tagResponse = 'Response',
  tagSummary = 'Summary',
  tagTag = 'Tag',
}

export const DEFAULT_PATH: IPath = {
  consumes: ['application/json'],
  description: '',
  operationId: undefined,
  produces: ['application/json'],
  responses: {},
  security: [],
  summary: '',
  tags: [],
};

function getFullFilePathWithoutExtension(file: string): string {
  const parsedFile = parse(file);
  return join(parsedFile.dir, parsedFile.name);
}

export class KJSRouter {
  private readonly _swagger: ISwagger;

  private _router: Router = new Router();

  private _swaggerFileName: string;

  constructor(swagger: ISwagger = DEFAULT_SWAGGER) {
    this._swagger = swagger;
    if (swagger.basePath) this._router.prefix(swagger.basePath);

    if (swagger.autoImportControllers) this.autoLoadControllers(swagger.autoImportControllers.globPath);
    if (swagger.autoImportSchemas) this.autoLoadSchemas(swagger.autoImportSchemas.globPath);
  }

  private autoLoadControllers = async (pathPattern: string) => {
    const allControllers = (
      await Promise.all(
        glob
          .sync(pathPattern)
          .map(getFullFilePathWithoutExtension)
          .map(async (fullPath) => {
            const module = await import(fullPath);

            return Object.values(module).filter((moduleValue) => joi.isSchema(moduleValue));
          }),
      )
    )
      .flat()
      .filter(Boolean);

    allControllers.forEach((controller) => this.loadController(controller));
  };

  private autoLoadSchemas = async (pathPattern: string) => {
    const allSchemas = await Promise.all(
      glob
        .sync(pathPattern)
        .map(getFullFilePathWithoutExtension)
        .map(async (fullPath) => {
          const module = await import(fullPath);
          const fileName = basename(fullPath);

          if (!module.default) {
            console.warn(`No default export defined for file "${fileName}"`);
            return;
          }
          const isControllerClass = Object.keys(module.default).some((key) => key === 'Controller');
          if (!isControllerClass) return;

          console.info(`controller added: ${module.default.name}`);

          return module.default;
        })
        .filter(Boolean),
    );

    allSchemas.forEach((schema) => this.addDefinition(schema));
  };

  public loadController(Controller: any, decorator: Function = null): void {
    if (Controller[Tags.tagController]) {
      const allMethods = Controller[Tags.tagMethod] || new Map();
      const paths = [...allMethods.keys()];
      const middleMethods = Controller[Tags.tagMiddleMethod] || new Map();
      const middleWares = Controller[Tags.tagMiddleWare] || new Map();
      paths.forEach((path) => {
        const temp = {};
        const fullPath = (Controller[Tags.tagController] + path).replace(this._swagger.basePath, '');
        const methods = allMethods.get(path);
        for (const [k, v] of methods) {
          const router = _.cloneDeep(DEFAULT_PATH);
          const mMethods = middleMethods.get(v.key);
          const wares = middleWares.has(v.key) ? [...middleWares.get(v.key)] : [];
          if (mMethods) {
            for (let i = 0, len = mMethods.length; i < len; i++) {
              mMethods[i](router, this._swagger);
            }
          }
          temp[k] = router;
          if (this._router[k]) {
            this._router[k](
              (Controller[Tags.tagController] + path).replace(/{(\w+)}/g, ':$1'),
              ...wares.concat(
                decorator
                  ? async (ctx, next) => {
                      await decorator(v.handle, ctx, next, router.summary);
                    }
                  : v.handle,
              ),
            );
          }
        }
        this._swagger.paths[fullPath] = temp;
      });
    }
  }

  public addDefinition(objectDefinition: ObjectSchema): void {
    const schemaName = objectDefinition._flags.id;
    if (!schemaName) {
      throw new Error('Schema doesnt have a joi id. Please use .id(string) on schema definition');
    }

    try {
      this._swagger.definitions[schemaName] = toSchema(objectDefinition);
    } catch (e) {}
  }

  public setSwaggerFile(fileName: string): void {
    this._swaggerFileName = this._swagger.basePath ? this._swagger.basePath + '/' + fileName : '/' + fileName;
    this._router.get('/' + fileName, (ctx, next) => {
      ctx.body = JSON.stringify(this._swagger);
    });
  }

  public getSwaggerFile(): string {
    return this._swaggerFileName;
  }

  public loadSwaggerUI(url: string): void {
    this._router.get(
      url,
      koaSwagger({
        routePrefix: false,
        swaggerOptions: {
          url: this._swaggerFileName,
        },
      }),
    );
  }

  public getRouter(): Router {
    return this._router;
  }
}
