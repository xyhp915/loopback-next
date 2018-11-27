// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: @loopback/core
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {expect} from '@loopback/testlab';
import {Context, BindingScope} from '@loopback/context';
import {
  ContextWithLifeCycle,
  Server,
  LifeCycleObserver,
  CoreBindings,
} from '../..';
import {asLifeCycleObserverBinding} from '../../src';

describe('lifecycle context', () => {
  let ctx: ContextWithLifeCycle;
  beforeEach(givenContext);

  it('finds servers as life cycle observers', () => {
    givenServerBinding('servers.FakeServer');
    const bindings = ctx.findLifeCycleObserverBindings();
    expect(bindings.map(b => b.key)).to.containEql('servers.FakeServer');
  });

  it('finds life cycle observers by tag', () => {
    ctx
      .bind('my-observer')
      .toClass(MyObserver)
      .apply(asLifeCycleObserverBinding);
    const bindings = ctx.findLifeCycleObserverBindings();
    expect(bindings.map(b => b.key)).to.containEql('my-observer');
  });

  it('sorts servers as last group by default', () => {
    givenServerBinding('server-1', 'server');
    givenServerBinding('server-2');
    givenObserverBinding('my-observer-1', 'g1');
    givenObserverBinding('my-observer-2', 'g2');
    givenObserverBinding('my-observer-3');

    const bindings = ctx.findLifeCycleObserverBindings();
    expect(bindings.map(b => b.key)).to.eql([
      'my-observer-1',
      'my-observer-2',
      'my-observer-3',
      'server-1',
      'server-2',
    ]);
  });

  it('sorts life cycle observers by group', () => {
    ctx.configureLifeCycleObserverGroups(['g1', 'g2']);
    givenObserverBinding('my-observer-1', 'g1');
    givenObserverBinding('my-observer-2', 'g2');
    givenObserverBinding('my-observer-3', 'g1');

    const bindings = ctx.findLifeCycleObserverBindings();
    expect(bindings.map(b => b.key)).to.eql([
      'my-observer-1',
      'my-observer-3',
      'my-observer-2',
    ]);
  });

  it('starts/stops all registered life cycle observers by order', async () => {
    const events: string[] = [];
    class MockObserver implements LifeCycleObserver {
      constructor(private name: string) {}

      start() {
        events.push(`start-${this.name}`);
      }
      stop() {
        events.push(`stop-${this.name}`);
      }
    }

    ctx.configureLifeCycleObserverGroups(['g1', 'g2', 'server']);

    ctx
      .bind('my-observer-2')
      .to(new MockObserver('2'))
      .tag({[CoreBindings.Tags.LIFE_CYCLE_OBSERVER_GROUP]: 'g2'})
      .apply(asLifeCycleObserverBinding);

    ctx
      .bind('my-observer-1')
      .to(new MockObserver('1'))
      .tag({[CoreBindings.Tags.LIFE_CYCLE_OBSERVER_GROUP]: 'g1'})
      .apply(asLifeCycleObserverBinding);

    // Add a server
    ctx
      .bind('my-server')
      .to(new MockObserver('server'))
      .tag(CoreBindings.Tags.SERVER)
      .apply(asLifeCycleObserverBinding);

    await ctx.start();
    expect(events).to.eql(['start-1', 'start-2', 'start-server']);
    await ctx.stop();
    expect(events).to.eql([
      'start-1',
      'start-2',
      'start-server',
      'stop-server',
      'stop-2',
      'stop-1',
    ]);
  });

  it('allows pre/post events', async () => {
    const events: string[] = [];
    class MockObserver implements LifeCycleObserver {
      constructor(private name: string) {}

      preStart() {
        events.push(`preStart-${this.name}`);
      }

      start() {
        events.push(`start-${this.name}`);
      }

      postStart() {
        events.push(`postStart-${this.name}`);
      }

      preStop() {
        events.push(`preStop-${this.name}`);
      }

      stop() {
        events.push(`stop-${this.name}`);
      }

      postStop() {
        events.push(`postStop-${this.name}`);
      }
    }

    ctx.configureLifeCycleObserverGroups(['g1', 'g2']);

    ctx
      .bind('my-observer-1')
      .to(new MockObserver('1'))
      .tag({[CoreBindings.Tags.LIFE_CYCLE_OBSERVER_GROUP]: 'g1'})
      .apply(asLifeCycleObserverBinding);

    ctx
      .bind('my-observer-2')
      .to(new MockObserver('2'))
      .tag({[CoreBindings.Tags.LIFE_CYCLE_OBSERVER_GROUP]: 'g2'})
      .apply(asLifeCycleObserverBinding);

    await ctx.start();
    expect(events).to.eql([
      'preStart-1',
      'preStart-2',
      'start-1',
      'start-2',
      'postStart-1',
      'postStart-2',
    ]);
    await ctx.stop();
    expect(events).to.eql([
      'preStart-1',
      'preStart-2',
      'start-1',
      'start-2',
      'postStart-1',
      'postStart-2',
      'preStop-2',
      'preStop-1',
      'stop-2',
      'stop-1',
      'postStop-2',
      'postStop-1',
    ]);
  });

  function givenContext() {
    ctx = new ContextWithLifeCycle('context-with-lifecycle');
  }

  function givenObserverBinding(key: string, group?: string) {
    const binding = ctx
      .bind(key)
      .toClass(MyObserver)
      .apply(asLifeCycleObserverBinding);
    if (group) {
      binding.tag({[CoreBindings.Tags.LIFE_CYCLE_OBSERVER_GROUP]: group});
    }
    return binding;
  }

  function givenServerBinding(key: string, group?: string) {
    const serverBinding = ctx
      .bind(key)
      .toClass(FakeServer)
      .tag(CoreBindings.Tags.SERVER)
      .inScope(BindingScope.SINGLETON);
    if (group) {
      serverBinding.tag({[CoreBindings.Tags.LIFE_CYCLE_OBSERVER_GROUP]: group});
    }
    return serverBinding;
  }

  class FakeServer extends Context implements Server {
    listening: boolean = false;
    constructor() {
      super();
    }
    async start(): Promise<void> {
      this.listening = true;
    }

    async stop(): Promise<void> {
      this.listening = false;
    }
  }

  class MyObserver implements LifeCycleObserver {
    status = 'not-initialized';

    start() {
      this.status = 'started';
    }
    stop() {
      this.status = 'stopped';
    }
  }
});
