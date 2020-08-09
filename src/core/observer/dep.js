/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
export default class Dep {
  static target: ?Watcher;
  id: number;
  subs: Array<Watcher>;

  constructor () {
    this.id = uid++
    this.subs = [] // 订阅者列表
  }

  addSub (sub: Watcher) {
    this.subs.push(sub)
  }

  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }

  // 把当前这个 dep (this所指) 添加到 Dep.target （指向当前正在被计算的 watcher） 的订阅目标列表（deps）中，
  // 同时也把 Dep.target 添加到这个 dep 的订阅者（subs）数组中
  // 也就是说，watcher 的订阅目标列表中有 dep，反过来 dep 的 subs 列表中也有这个 watcher
  depend () {
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }
  // dep 所关联的值发生变化时，通过 notify() 来调用所有订阅者的 update() 方法，
  // update 方法中会执行订阅者的回调函数。
  notify () {
    // stabilize the subscriber list first
    const subs = this.subs.slice()
    // 如果config.async为false，表示Vue采用同步更新的方式，此时
    // 需要先把subs中的watcher按id由小到大排序。
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    // 逐个执行subs中每个watcher的update()方法。
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
// Dep.target 不是一成不变的，它通过 pushTarget 和 popTarget 两个方法不断的在变动，
// 就像注释中所说，Dep.target 始终指向的是当前要被计算的 watcher 实例
Dep.target = null
const targetStack = []

export function pushTarget (target: ?Watcher) {
  targetStack.push(target)
  Dep.target = target
}

export function popTarget () {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}
