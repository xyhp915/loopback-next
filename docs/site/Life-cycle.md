---
lang: en
title: 'Life Cycles'
keywords: LoopBack 4.0, LoopBack 4
sidebar: lb4_sidebar
permalink: /doc/en/lb4/Life-cycle.html
---

## Overview

A LoopBack application has its own life cycles at runtime. There are two methods
to control the transition of states:

- start: Start the application
- stop: Stop the application

It's often desirable for various types of artifacts to participate in the life
cycles and perform related processing upon `start` and `stop`. Good examples of
such artifacts are:

- Servers

  - start: Starts the HTTP server listening for connections.
  - stop: Stops the server from accepting new connections.

- Components

- DataSources

  - connect: Connect to the underlying database or service
  - disconnect: Disconnect from the underlying database or service

- Custom scripts
  - start: Custom logic to be invoked when the application starts
  - stop: Custom logic to be invoked when the application stops

## The `LifeCycleObserver` interface

To react on life cycle events, a life cycle observer implements the
`LifeCycleObserver` interface.

```ts
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
```

Please note all methods are optional so that an observer can opt in certain
events. Each main events such as `start` and `stop` are further divided into
three sub-phases to allow the multiple-step processing.

## Register a life cycle observer

A life cycle observer can be registered by binding itself to the application
context with a special tag - `CoreTags.LIFE_CYCLE_OBSERVER`.

## Discover life cycle observers

The `Application` finds all bindings tagged with `CoreTags.LIFE_CYCLE_OBSERVER`
within the context chain and resolve them as observers to be notified.

## Notify life cycle observers of start/stop related events

## Control the order of notification

There may be dependencies between life cycle observers and their order of
processing for `start` and `stop` need to be coordinated. For example, we
usually start a server to listen on incoming requests only after other parts of
the application are ready to handle requests. The stop sequence is typically
processed in the reverse order. To support such cases, we introduce
two-dimension steps to control the order of life cycle actions.

### Group

First of all, we allow each of the life cycle observers to be tagged with a
group. For example:

- datasource

  - connect/disconnect mongodb
  - mysql

- server
  - rest
  - gRPC

We can then configure the application to trigger observers group by group as
configured by an array of groups in order such as `['datasource', 'server']`.
Observers within the same group can be notified in parallel.

### Event phases

It's also desirable for certain observers to do some processing before, upon, or
after the `start` and `stop` events. To allow that, we notify each observer in
three phases:

start - preStart, start, and postStart stop - preStop, stop, and postStop

Combining groups and event phases, it's flexible to manage multiple observers so
that they can be started/stopped gracefully in order.

For example, with a group order as `['datasource', 'server']` and three
observers registered as follows:

- datasource group: MySQLDataSource, MongoDBDataSource
- server group: RestServer

The start sequence will be:

1. MySQLDataSource.preStart
2. MongoDBDataSource.preStart
3. RestServer.preStart
4. MySQLDataSource.start
5. MongoDBDataSource.start
6. RestServer.start
7. MySQLDataSource.postStart
8. MongoDBDataSource.postStart
9. RestServer.postStart

## Add custom life cycle observers by convention

Each application can have custom life cycle observers to be dropped into
`src/observers` folder as classes implementing `LifeCycleObserver`.

During application.boot(), such artifacts are discovered, loaded, and bound to
the application context as life cycle observers. This is achieved by a built-in
`LifeCycleObserverBooter` extension.

## CLI command

To make it easy for application developers to add custom life cycle observers,
we introduce `lb4 observer` command as part the CLI.
