/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 * 一个 watcher 就是一个订阅者，一个订阅者可以订阅多个目标对象的变化，这些目标对象就保存在 deps 依赖列表中，
 * 一个 dep 就是一个被订阅的目标对象，一个 dep 的内部维护着一个订阅者列表，当 dep 所关联的值发生变化时，dep 会
 * 通知（notify()）列表中的所有订阅者执行各自对应的 watcher 回调。
 * 一个 dep 关联一个被监测着的值，所谓被监测着的值，是说这个值关联着一个 observer 对象，由于 defineReactive()
 * 重新定义了值 val 的 get/set 属性函数，同时给值 val 关联了一个 dep 对象，当读取这个值 val 时（通过 get 函数），
 * 这个 dep 会把自己添加到当前处于活动状态的 watcher （Dep.target）的依赖列表 deps 中，也就是说把这个 dep 作为当前
 * Dep.target 的订阅对象。同时也把 Dep.target 添加到这个 dep 的订阅者列表 subs 中。这样当 dep 所关联的值 val 有所修改（通过 set 函数）,
 * 通过 dep.notify() 会把这一变化通知给订阅者列表中的若干个 watcher，随即 watcer 重新获取最新的 val 值，执行之前注册的回调（就是
 * 注册的以 (newVal, oldVal) 为参数的回调）
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function, // 要监督的对象，是一个字符串表达式，或者是一个函数
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm
    if (isRenderWatcher) {
      vm._watcher = this
    }
    // 把正在创建的这个新 watcher 添加到这个 vm 的 watchers 列表
    vm._watchers.push(this)
    // options
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      this.lazy = !!options.lazy
      this.sync = !!options.sync
      this.before = options.before
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.lazy // for lazy watchers
    // deps/depIds 保存的是上一轮 get() 周期中收集的旧依赖
    // newDeps/newDepIds 中是当前新一轮周期中收集的新依赖
    // 每执行一次 this.get() 方法，会在最后调用 cleanupDeps() 方法把 newDeps/newDepIds 收集的新依赖更新到 deps/depIds 上
    // deps/depIds 和 newDeps/newDepIds 其实就是一个东西：依赖项列表，只不过代表的时间含义不同
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  get () {
    // 把 Dep.target 置为当前 watcher
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      // this.getter() 函数要么是开发者自定义的函数（定义当前 watcher 时，待监督的对象是一个函数）
      // 要么是通过诸如 vm.data.prop1.obj1.key1 这样的属性键访问表达式（定义当前 watcher 时，待监督的对象是一个字符串表达式）
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        traverse(value)
      }
      popTarget()
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  // 1.如果当前 watcher 的 newDepIds 中没有该 dep
  // 2.把该 dep 分别加到当前 watcher 的 newDepIds 和 newDeps 中
  // 3.如果当前 watcher 的 depIds 中没有该 dep，则把当前 watcher 加到该 dep 的 subs 列表中
  // 收集依赖的过程只操作 newDepIds/newDeps，在 cleanupDeps() 方法中再同步到 depIds/deps 中
  addDep (dep: Dep) {
    const id = dep.id
    if (!this.newDepIds.has(id)) {
      // 以两次 this.get() 的执行间隔为一个周期，get() 执行的末尾调用 cleanupDeps() 把 newDepIds/newDeps 同步到了 depIds/deps,然后清空了 newDepIds/newDeps，
      // 所以在新一轮的开始，执行 addDep() 时， newDepIds/newDeps 是为空的，它完全可能重新收集之前曾经收集过的依赖 dep。
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      // depIds 中保存的是上一周期中收集的依赖，如果 depIds 中还没有这个新的 dep，基于双向绑定的原理，则需要把当前 watcher 添加到这个新 dep 的 subs 数组中
      // 如果 depIds 中已经有这个 id，说明当前 watcher 在之前的周期中已经添加到这个 dep 的 subs 数组中了，这次无需再加
      if (!this.depIds.has(id)) {
        // addDep() 方法核心的一句！！把当前 watcher 添加到这个依赖的 subs 数组中，
        // 之后当这个 dep 所关联的值有变化时，会通过 notify() 方法通知当前 watcher 执行 update
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   * 每执行一次 this.get() 方法，就会执行一次 cleanupDeps()
   * 此时 newDepIds 和 newDeps 会分别更新到 depIds 和 deps 上，然后清空 newDepIds 和 newDeps
   * 也就是说，每执行一次 get() 方法，newDepIds/newDeps 就会同步到 depIds/deps 上，
   * 如果以 get() 的执行间隔为一个周期，在这样的一个周期内，newDepIds/newDeps 会通过 addDep() 方法不断收集新的依赖 dep，
   * 而 depIds/deps 中保存的是上一个周期中收集的旧依赖
   */
  cleanupDeps () {
    let i = this.deps.length
    while (i--) {
      // 找出 deps 中那些不在 newDepIds 中的 dep，把当前 watcher 从这些 dep 的 subs 中移除
      // deps 中保存的是上一个 get() 周期中收集的依赖，newDepIds/newDeps 中是当前这一轮中收集的依赖，
      // 所以，这里的意思就是找出那些在本轮 get() 周期中已经不存在的 dep，然后把当前 watcher 从这些 dep 的 subs 数组中移除
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        // 把当前 watcher 从已经不在本轮依赖列表中的 dep 的 subs 数组中移除
        dep.removeSub(this)
      }
    }
    // 把 newDepIds 的内容换到 depIds 上，然后清空 newDepIds
    // 把本轮新收集的依赖 Id 列表同步到 depIds 上
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    // 把 newDeps 的内容换到 deps 上，然后清空 newDeps
    // 把本轮新收集的依赖列表同步到 deps 上
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   * 依赖列表中任何一个 dep 所关联的值发生变化，都会通过 dep.notify() 来触发 watcher.update() 的执行，进而执行 watcher 回调
   */
  update () {
    /* istanbul ignore else */
    if (this.lazy) {
      this.dirty = true
    } else if (this.sync) {
      // 只有当是同步 watcher 时才会直接执行 run()（执行watcher回调）
      this.run()
    } else {
      // 绝大多数的 watcher 都会走这里，加入微任务队列中（通过 nextTick），在当前宏任务结束后全部执行掉
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   * 获取新的value，执行监听回调函数 cb
   */
  run () {
    if (this.active) {
      const value = this.get()
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
        if (this.user) {
          try {
            this.cb.call(this.vm, value, oldValue)
          } catch (e) {
            handleError(e, this.vm, `callback for watcher "${this.expression}"`)
          }
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  // 对当前该 watcher 收集到的 deps 全部在 Dep.target 这个全局 watcher 对象上执行 addDep(dep) 操作
  // 下来参看 watcher.addDep(dep) 的注释：

  // 1.如果当前 watcher 的 newDepIds 中没有该 dep
  // 2.把该 dep 分别加到当前 watcher 的 newDepIds 和 newDeps 中
  // 3.如果当前 watcher 的 depIds 中没有该 dep，则把当前 watcher 加到该 dep 的 subs 列表中

  // 总结一下，watcer.depend() 做的事就是：
  // 1.把 watcher.deps 中的所有 dep 添加到 watcher 的 newDeps 中（newDeps 中已经有了就不添加了）
  // 2.把 watcher 分别加到 watcher.deps 中所有这些 dep 的 subs 列表中

  // 由此可见，watcher.deps 和 dep.subs 形成了一个循环的嵌套
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        // 把当前 watcher 从它所在的 vm 实例的 _watchers 列表中删除
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        // 把这个 watcher 从它的所有依赖对象的订阅者列表（subs）中删除，删除后，当这个dep所关联的值再有变化时，dep.notify() 就不会再通知到该 watcher
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
