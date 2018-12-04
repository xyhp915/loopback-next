// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: @loopback/core
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {Binding, BindingScope, Constructor} from '@loopback/context';
import {CoreTags} from './keys';

/**
 * Observers to handle life cycle start/stop events
 */
export interface LifeCycleObserver {
  preStart?(): Promise<void> | void;
  start?(): Promise<void> | void;
  postStart?(): Promise<void> | void;
  preStop?(): Promise<void> | void;
  stop?(): Promise<void> | void;
  postStop?(): Promise<void> | void;
}

const lifeCycleMethods: (keyof LifeCycleObserver)[] = [
  'preStart',
  'start',
  'postStart',
  'preStop',
  'stop',
  'postStop',
];

/**
 * Test if an object implements LifeCycleObserver
 * @param obj An object
 */
export function isLifeCycleObserver(obj: {
  [name: string]: unknown;
}): obj is LifeCycleObserver {
  return lifeCycleMethods.some(m => typeof obj[m] === 'function');
}

/**
 * Test if a class implements LifeCycleObserver
 * @param ctor A class
 */
export function isLifeCycleObserverClass(
  ctor: Constructor<unknown>,
): ctor is Constructor<LifeCycleObserver> {
  return ctor.prototype && isLifeCycleObserver(ctor.prototype);
}

/**
 * Configure the binding as life cycle observer
 * @param binding Binding
 */
export function asLifeCycleObserverBinding<T = unknown>(binding: Binding<T>) {
  return binding
    .tag(CoreTags.LIFE_CYCLE_OBSERVER)
    .inScope(BindingScope.SINGLETON);
}
