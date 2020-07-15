/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

const arrayProto = Array.prototype
export const arrayMethods = Object.create(arrayProto)

const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
methodsToPatch.forEach(function (method) {
  // cache original method
  const original = arrayProto[method]
  def(arrayMethods, method, function mutator (...args) {
    const result = original.apply(this, args)
    const ob = this.__ob__
    let inserted
    // inserted 是用来保存将要新插入的数据的，push, unshift, splice 三个操作可能会插入新值
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2) // 从 splice(targetIndex, deleteNum, value) 的 3 个参数中获取第三个参数，也就是将要插入的新值
        break
    }
    // 注意，因为 args 是个数组，所以 inserted 也是数组
    // 给将要插入的新值关联上 observer 实例，如果 inserted 中的值不是数组或者对象，而是 boolean, number, string 这样的基础类型值，
    // 是不会给它们关联 observer 实例的
    if (inserted) ob.observeArray(inserted)
    // notify change
    // 借助当前被操作的数组所关联的 observer 对象中的 dep 实例，把这次数组的变化通知给各个订阅者 watchers，让他们执行各自的回调
    ob.dep.notify()
    return result
  })
})
