// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: @loopback/core
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {Binding, BindingScope, BindingType, Context} from '@loopback/context';
import {CoreBindings} from './keys';
import {LifeCycleObserver} from './lifecycle';
const CoreTags = CoreBindings.Tags;
import debugFactory = require('debug');
const debug = debugFactory('loopback:core:lifecycle');

/**
 *
 * A Context subclass that supports life cycle
 *
 * TODO: [rfeng] We might want to move it down to `@loopback/context`
 * NOTE: [rfeng] I was trying to implement it as a mixin but TypeScript
 * does not allow private/protected members of `Context`
 */
export class ContextWithLifeCycle extends Context implements LifeCycleObserver {
  /**
   * Configures the ordering of life cycle observers by group names
   */
  protected lifeCycleObserverGroups: string[] = ['server'];

  // A mixin class has to take in a type any[] argument!
  // tslint:disable-next-line:no-any
  constructor(...args: any[]) {
    super(...args);
  }

  configureLifeCycleObserverGroups(groups: string[]) {
    this.lifeCycleObserverGroups = groups || ['server'];
  }

  /**
   * Find all life cycle observer bindings. By default, a constant or singleton
   * binding tagged with `CoreBindings.Tags.LIFE_CYCLE_OBSERVER` or
   * `CoreBindings.Tags.SERVER`.
   */
  findLifeCycleObserverBindings() {
    const bindings = this.find<LifeCycleObserver>(
      binding =>
        (binding.type === BindingType.CONSTANT ||
          binding.scope === BindingScope.SINGLETON) &&
        (binding.tagMap[CoreTags.LIFE_CYCLE_OBSERVER] != null ||
          binding.tagMap[CoreTags.SERVER]),
    );
    return this.sortLifeCycleObserverBindings(bindings);
  }

  /**
   * Get the group for a given life cycle observer binding
   * @param binding Life cycle observer binding
   */
  protected _getLifeCycleObserverGroup(
    binding: Readonly<Binding<LifeCycleObserver>>,
  ): string {
    // First check if there is an explicit group name in the tag
    let group = binding.tagMap[CoreTags.LIFE_CYCLE_OBSERVER_GROUP];
    if (!group) {
      // Fall back to a tag that matches one of the groups
      group = this.lifeCycleObserverGroups.find(g => binding.tagMap[g] === g);
    }
    return group || '';
  }

  /**
   * Sort the life cycle observer bindings so that we can start/stop them
   * in the right order. By default, we can start other observers before servers
   * and stop them in the reverse order
   * @param bindings Life cycle observer bindings
   */
  sortLifeCycleObserverBindings(
    bindings: Readonly<Binding<LifeCycleObserver>>[],
  ) {
    return bindings.sort((b1, b2) => {
      let group1 = this._getLifeCycleObserverGroup(b1);
      let group2 = this._getLifeCycleObserverGroup(b2);
      return (
        this.lifeCycleObserverGroups.indexOf(group1) -
        this.lifeCycleObserverGroups.indexOf(group2)
      );
    });
  }

  /**
   * Notify each of bindings with the given event
   * @param bindings An array of bindings for life cycle observers
   * @param event Event name
   */
  async notifyLifeCycleObservers(
    bindings: Readonly<Binding<LifeCycleObserver>>[],
    event: keyof LifeCycleObserver,
  ) {
    for (const binding of bindings) {
      const observer = await this.get<LifeCycleObserver>(binding.key);
      debug('Notifying binding %s of "%s" event...', binding.key, event);
      await this.invokeLifeCycleObserver(observer, event);
      debug('Binding %s has processed "%s" event.', binding.key, event);
    }
  }

  /**
   * Invoke an observer for the given event
   * @param observer A life cycle observer
   * @param event Event name
   */
  async invokeLifeCycleObserver(
    observer: LifeCycleObserver,
    event: keyof LifeCycleObserver,
  ) {
    if (typeof observer[event] === 'function') {
      await observer[event]!();
    }
  }

  /**
   * Start the application, and all of its registered servers.
   *
   * @returns {Promise}
   * @memberof Application
   */
  public async start(): Promise<void> {
    debug('Starting the %s...', this.name);
    const bindings = this.findLifeCycleObserverBindings();
    const events: (keyof LifeCycleObserver)[] = [
      'preStart',
      'start',
      'postStart',
    ];
    for (const event of events) {
      debug('Beginning %s %s...', event, this.name);
      await this.notifyLifeCycleObservers(bindings, event);
      debug('Finished %s %s', event, this.name);
    }
  }

  /**
   * Stop the application instance and all of its registered servers.
   * @returns {Promise}
   * @memberof Application
   */
  public async stop(): Promise<void> {
    debug('Stopping the %s...', this.name);
    const bindings = this.findLifeCycleObserverBindings().reverse();
    // Stop in the reverse order
    const events: (keyof LifeCycleObserver)[] = ['preStop', 'stop', 'postStop'];
    for (const event of events) {
      debug('Beginning %s %s...', event, this.name);
      await this.notifyLifeCycleObservers(bindings, event);
      debug('Finished %s %s', event, this.name);
    }
  }
}
