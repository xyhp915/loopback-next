// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: @loopback/core
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {Context, Binding, BindingScope, Constructor} from '@loopback/context';
import {Server} from './server';
import {Component, mountComponent} from './component';
import {CoreBindings} from './keys';
import {LifeCycleObserver} from './lifecycle';

/**
 * Application is the container for various types of artifacts, such as
 * components, servers, controllers, repositories, datasources, connectors,
 * and models.
 */
export class Application extends Context implements LifeCycleObserver {
  constructor(public options: ApplicationConfig = {}) {
    super();

    // Bind to self to allow injection of application context in other modules.
    this.bind(CoreBindings.APPLICATION_INSTANCE).to(this);
    // Make options available to other modules as well.
    this.bind(CoreBindings.APPLICATION_CONFIG).to(options);
  }

  /**
   * Register a controller class with this application.
   *
   * @param controllerCtor {Function} The controller class
   * (constructor function).
   * @param {string=} name Optional controller name, default to the class name
   * @return {Binding} The newly created binding, you can use the reference to
   * further modify the binding, e.g. lock the value to prevent further
   * modifications.
   *
   * ```ts
   * class MyController {
   * }
   * app.controller(MyController).lock();
   * ```
   */
  controller(controllerCtor: ControllerClass, name?: string): Binding {
    name = name || controllerCtor.name;
    return this.bind(`controllers.${name}`)
      .toClass(controllerCtor)
      .tag('controller');
  }

  /**
   * Bind a Server constructor to the Application's master context.
   * Each server constructor added in this way must provide a unique prefix
   * to prevent binding overlap.
   *
   * ```ts
   * app.server(RestServer);
   * // This server constructor will be bound under "servers.RestServer".
   * app.server(RestServer, "v1API");
   * // This server instance will be bound under "servers.v1API".
   * ```
   *
   * @param {Constructor<Server>} server The server constructor.
   * @param {string=} name Optional override for key name.
   * @returns {Binding} Binding for the server class
   * @memberof Application
   */
  public server<T extends Server>(
    ctor: Constructor<T>,
    name?: string,
  ): Binding {
    const suffix = name || ctor.name;
    const key = `${CoreBindings.SERVERS}.${suffix}`;
    return this.bind(key)
      .toClass(ctor)
      .tag('server')
      .inScope(BindingScope.SINGLETON);
  }

  /**
   * Bind an array of Server constructors to the Application's master
   * context.
   * Each server added in this way will automatically be named based on the
   * class constructor name with the "servers." prefix.
   *
   * If you wish to control the binding keys for particular server instances,
   * use the app.server function instead.
   * ```ts
   * app.servers([
   *  RestServer,
   *  GRPCServer,
   * ]);
   * // Creates a binding for "servers.RestServer" and a binding for
   * // "servers.GRPCServer";
   * ```
   *
   * @param {Constructor<Server>[]} ctors An array of Server constructors.
   * @returns {Binding[]} An array of bindings for the registered server classes
   * @memberof Application
   */
  public servers<T extends Server>(ctors: Constructor<T>[]): Binding[] {
    return ctors.map(ctor => this.server(ctor));
  }

  /**
   * Retrieve the singleton instance for a bound constructor.
   *
   * @template T
   * @param {Constructor<T>=} ctor The constructor that was used to make the
   * binding.
   * @returns {Promise<T>}
   * @memberof Application
   */
  public async getServer<T extends Server>(
    target: Constructor<T> | string,
  ): Promise<T> {
    let key: string;
    // instanceof check not reliable for string.
    if (typeof target === 'string') {
      key = `${CoreBindings.SERVERS}.${target}`;
    } else {
      const ctor = target as Constructor<T>;
      key = `${CoreBindings.SERVERS}.${ctor.name}`;
    }
    return await this.get<T>(key);
  }

  /**
   * Start the application, and all of its registered servers.
   *
   * @returns {Promise}
   * @memberof Application
   */
  public async start(): Promise<void> {
    await this._forEachComponent(async c => {
      if (c.lifeCycleObservers) {
        for (const observer of c.lifeCycleObservers) {
          await observer.start();
        }
      }
    });
    await this._forEachServer(s => s.start());
  }

  /**
   * Stop the application instance and all of its registered servers.
   * @returns {Promise}
   * @memberof Application
   */
  public async stop(): Promise<void> {
    await this._forEachServer(s => s.stop());
    await this._forEachComponent(async c => {
      if (c.lifeCycleObservers) {
        for (const observer of c.lifeCycleObservers.reverse()) {
          await observer.stop();
        }
      }
    });
  }

  /**
   * Discover bindings matching the key namespace or tag
   * @param keyNamespace Binding key prefix
   * @param tag Tag name
   */
  private _findByNamespaceOrTag(keyNamespace: string, tag?: string) {
    const bindings = this.find(
      b => b.key.startsWith(`${keyNamespace}.`) || (tag && b.tagMap[tag]),
    );
    return bindings;
  }

  /**
   * Helper function for iterating across all registered servers.
   * @protected
   * @template T
   * @param {(s: Server) => Promise<T>} fn The function to run against all
   * registered servers
   * @memberof Application
   */
  protected async _forEachServer<T>(fn: (s: Server) => Promise<T> | T) {
    const bindings = this._findByNamespaceOrTag(CoreBindings.SERVERS, 'server');
    await Promise.all(
      bindings.map(async binding => {
        const server = await this.get<Server>(binding.key);
        return await fn(server);
      }),
    );
  }

  /**
   * Helper function for iterating across all registered components.
   * @protected
   * @template T
   * @param {(s: Server) => Promise<T>} fn The function to run against all
   * registered components
   * @memberof Application
   */
  protected async _forEachComponent<T>(fn: (c: Component) => Promise<T> | T) {
    const bindings = this._findByNamespaceOrTag(
      CoreBindings.COMPONENTS,
      'component',
    );
    await Promise.all(
      bindings.map(async binding => {
        const component = await this.get<Component>(binding.key);
        return await fn(component);
      }),
    );
  }

  /**
   * Add a component to this application and register extensions such as
   * controllers, providers, and servers from the component.
   *
   * @param componentCtor The component class to add.
   * @param {string=} name Optional component name, default to the class name
   *
   * ```ts
   *
   * export class ProductComponent {
   *   controllers = [ProductController];
   *   repositories = [ProductRepo, UserRepo];
   *   providers = {
   *     [AUTHENTICATION_STRATEGY]: AuthStrategy,
   *     [AUTHORIZATION_ROLE]: Role,
   *   };
   * };
   *
   * app.component(ProductComponent);
   * ```
   */
  public component(componentCtor: Constructor<Component>, name?: string) {
    name = name || componentCtor.name;
    const componentKey = `${CoreBindings.COMPONENTS}.${name}`;
    this.bind(componentKey)
      .toClass(componentCtor)
      .inScope(BindingScope.SINGLETON)
      .tag('component');
    // Assuming components can be synchronously instantiated
    const instance = this.getSync<Component>(componentKey);
    mountComponent(this, instance);
  }

  /**
   * Set application metadata. `@loopback/boot` calls this method to populate
   * the metadata from `package.json`.
   *
   * @param metadata Application metadata
   */
  public setMetadata(metadata: ApplicationMetadata) {
    this.bind(CoreBindings.APPLICATION_METADATA).to(metadata);
  }
}

/**
 * Configuration for application
 */
export interface ApplicationConfig {
  /**
   * Other properties
   */
  // tslint:disable-next-line:no-any
  [prop: string]: any;
}

// tslint:disable-next-line:no-any
export type ControllerClass = Constructor<any>;

/**
 * Type definition for JSON
 */
export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export interface JSONObject {
  [property: string]: JSONValue;
}
export interface JSONArray extends Array<JSONValue> {}

/**
 * Type description for `package.json`
 */
export interface ApplicationMetadata extends JSONObject {
  name: string;
  version: string;
  description: string;
}
