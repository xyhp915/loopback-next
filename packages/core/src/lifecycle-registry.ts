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
 * A group of life cycle observers
 */
export type LifeCycleObserverGroup = {
  group: string;
  bindings: Readonly<Binding<LifeCycleObserver>>[];
};

export type LifeCycleObserverOptions = {
  /**
   * Notify observers of the same group in parallel, default to `true`
   */
  parallel?: boolean;
};

/**
 *
 * A Context subclass that supports life cycle
 *
 */
export class LifeCycleObserverRegistry implements LifeCycleObserver {
  constructor(
    protected ctx: Context,
    protected options: LifeCycleObserverOptions = {parallel: true},
  ) {}
  /**
   * Configures the ordering of life cycle observers by group names
   */
  protected groupsByOrder: string[] = ['server'];

  setGroupsByOrder(groups: string[]) {
    this.groupsByOrder = groups || ['server'];
  }

  /**
   * Find all life cycle observer bindings. By default, a constant or singleton
   * binding tagged with `CoreBindings.Tags.LIFE_CYCLE_OBSERVER` or
   * `CoreBindings.Tags.SERVER`.
   */
  findObserverBindings() {
    return this.ctx.find<LifeCycleObserver>(
      binding =>
        (binding.type === BindingType.CONSTANT ||
          binding.scope === BindingScope.SINGLETON) &&
        (binding.tagMap[CoreTags.LIFE_CYCLE_OBSERVER] != null ||
          binding.tagMap[CoreTags.SERVER]),
    );
  }

  /**
   * Get observer groups by order
   */
  getObserverGroupsByOrder(): LifeCycleObserverGroup[] {
    const bindings = this.findObserverBindings();
    return this.sortObserverBindingsByGroup(bindings);
  }

  /**
   * Get the group for a given life cycle observer binding
   * @param binding Life cycle observer binding
   */
  protected getObserverGroup(
    binding: Readonly<Binding<LifeCycleObserver>>,
  ): string {
    // First check if there is an explicit group name in the tag
    let group = binding.tagMap[CoreTags.LIFE_CYCLE_OBSERVER_GROUP];
    if (!group) {
      // Fall back to a tag that matches one of the groups
      group = this.groupsByOrder.find(g => binding.tagMap[g] === g);
    }
    return group || '';
  }

  /**
   * Sort the life cycle observer bindings so that we can start/stop them
   * in the right order. By default, we can start other observers before servers
   * and stop them in the reverse order
   * @param bindings Life cycle observer bindings
   */
  sortObserverBindingsByGroup(
    bindings: Readonly<Binding<LifeCycleObserver>>[],
  ) {
    // Group bindings in a map
    const groupMap: Map<
      string,
      Readonly<Binding<LifeCycleObserver>>[]
    > = new Map();
    for (const binding of bindings) {
      const group = this.getObserverGroup(binding);
      let bindingsInGroup = groupMap.get(group);
      if (bindingsInGroup == null) {
        bindingsInGroup = [];
        groupMap.set(group, bindingsInGroup);
      }
      bindingsInGroup.push(binding);
    }
    // Create an array for group entries
    const groups: LifeCycleObserverGroup[] = [];
    for (const entry of groupMap.entries()) {
      groups.push({group: entry[0], bindings: entry[1]});
    }
    // Sort the groups
    return groups.sort(
      (g1, g2) =>
        this.groupsByOrder.indexOf(g1.group) -
        this.groupsByOrder.indexOf(g2.group),
    );
  }

  /**
   * Notify an observer group of the given event
   * @param group A group of bindings for life cycle observers
   * @param event Event name
   */
  async notifyObserverGroup(
    group: LifeCycleObserverGroup,
    event: keyof LifeCycleObserver,
  ) {
    debug(
      'Notifying life cycle observer group %s of "%s" event...',
      group.group,
      event,
    );
    const notifiers: Promise<void>[] = [];
    for (const b of group.bindings) {
      const notifyObserver = async (
        binding: Readonly<Binding<LifeCycleObserver>>,
      ) => {
        const observer = await this.ctx.get<LifeCycleObserver>(binding.key);
        debug('Notifying binding %s of "%s" event...', binding.key, event);
        await this.invokeObserver(observer, event);
        debug('Binding %s has processed "%s" event.', binding.key, event);
      };
      if (this.options.parallel) {
        notifiers.push(notifyObserver(b));
      } else {
        await notifyObserver(b);
      }
    }
    if (this.options.parallel) {
      await Promise.all(notifiers);
    }
    debug(
      'Life cycle observer group %s has processed "%s" event.',
      group.group,
      event,
    );
  }

  /**
   * Invoke an observer for the given event
   * @param observer A life cycle observer
   * @param event Event name
   */
  protected async invokeObserver(
    observer: LifeCycleObserver,
    event: keyof LifeCycleObserver,
  ) {
    if (typeof observer[event] === 'function') {
      await observer[event]!();
    }
  }

  protected async notifyGroups(
    events: (keyof LifeCycleObserver)[],
    groups: LifeCycleObserverGroup[],
  ) {
    for (const event of events) {
      debug('Beginning %s %s...', event, this.ctx.name);
      for (const g of groups) {
        await this.notifyObserverGroup(g, event);
      }
      debug('Finished %s %s', event, this.ctx.name);
    }
  }

  /**
   * Notify all life cycle observers by group of `start`
   *
   * @returns {Promise}
   */
  public async start(): Promise<void> {
    debug('Starting the %s...', this.ctx.name);
    const groups = this.getObserverGroupsByOrder();
    await this.notifyGroups(['preStart', 'start', 'postStart'], groups);
  }

  /**
   * Notify all life cycle observers by group of `stop`
   *
   * @returns {Promise}
   */
  public async stop(): Promise<void> {
    debug('Stopping the %s...', this.ctx.name);
    const groups = this.getObserverGroupsByOrder().reverse();
    // Stop in the reverse order
    await this.notifyGroups(['preStop', 'stop', 'postStop'], groups);
  }
}
