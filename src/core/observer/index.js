/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 * 上面注释中所说的 —— 把目标对象的属性键 keys 转成 getters/setters ，用来收集依赖、通知更新 —— 这说的就是
 * defineReactive() 执行时候给每个属性键 key 都关联了一个 dep 对象，收集依赖、通知更新，都是 dep 对象实现的。
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0
    def(value, '__ob__', this)
    if (Array.isArray(value)) {
      if (hasProto) {
        // 直接把 arrayMethods 设置成 value 数组的原型对象,
        // 也就把 arrayMethods 中重新定义了的 7 种会修改原始数组值的方法添加到了 value 数组的原型链上
        protoAugment(value, arrayMethods)
      } else {
        // 在不支持 __proto__ 属性的时候，直接把 arrayMethods 中重定义的 7 个方法定义到 value 数组本身上
        copyAugment(value, arrayMethods, arrayKeys)
      }
      // 上面这个 if-else 都是对 value 数组自身方法的扩展或者重定义，
      // 下面再递归式的对 value 数组的每个元素关联上 observer 对象，value 数组中的 string, number, boolean 这样的
      // 基础类型值不会关联 observer，只给数组和对象元素关联。
      this.observeArray(value)
    } else {
      // 此时 value 是个对象，把它自身的可枚举的属性 key，都重新定义为 getter/setter
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   * 如果数组中的元素不是数组和对象，诸如 boolean, number, string, symbol, bigint, function 这样的
   * 基础类型值，是不会为其关联 observer 实例的
   */
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
export function observe (value: any, asRootData: ?boolean): Observer | void {
  if (!isObject(value) || value instanceof VNode) {
    // 除了 VNode 外，比如 boolean, number, string, symbol, function, bigint, undefined, null 这些类型的值
    // 都是不能关联 observer 实例的
    return
  }
  let ob: Observer | void
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    ob = new Observer(value)
  }
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep()

  const property = Object.getOwnPropertyDescriptor(obj, key)
  // 如果属性 key 已经被 Object.seal 或者 Object.freeze，则该属性无法添加成响应式
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get
  const setter = property && property.set
  // 原先这个属性没有 get 方法，或者同时有 get 和 set 方法，并且没有传入 val,
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  let childOb = !shallow && observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val
      if (Dep.target) {
        // get 方法除了获取值以外，也是一个收集依赖的过程，
        // 给每个 key 执行 defineReactive 时，都给它关联一个独有的 dep 实例，
        // 然后把这个 dep 添加到 Dep.target 的依赖列表（deps）中，同时把 Dep.target 也添加到 dep 的订阅者（subs）列表中
        dep.depend()
        if (childOb) {
          childOb.dep.depend()
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      childOb = !shallow && observe(newVal)
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 如果想要插入的位置 key > 数组本身的长度，会在数组中产生 empty 空洞
    target.length = Math.max(target.length, key)
    // 因为在 Observer 的构造函数中，已经把数组的 splice 方法重新定义为会执行 dep.notify() 通知的，
    // 所以这里插入一个值时，是会触发订阅者执行回调的。
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    // 修改对象自身已有的属性值，会通过 setter 触发这个对象所关联的 dep 把这个变化通知给订阅者
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if (!ob) {
    // 此时 target 对象没有关联的 observer 实例,
    // 举个例子，你也可以临时自定义一个对象，然后使用 Vue.set()/this.$set() 来给这个对象添加属性
    target[key] = val
    return val
  }
  // 此时的 key 是新增加的一个属性，而且 target 对象有关联的 observer 实例，
  // 此时则通过 defineReactive 在原始值（ob.value）上增加属性 key 的定义
  defineReactive(ob.value, key, val)
  // 因为有新增加的属性 key，所以需要手动执行 dep.notify() 把 target 的这一变化通知给所有订阅者 watchers，让这些订阅者 watchers 执行回调
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 同理，splice() 方法会触发该数组所关联的 dep 执行 notify()，通知相应的订阅者
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    // 如果 key 不是 target 对象自身已有的属性，本次 del 操作什么也不做
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  // 删除 target 对象上的属性，需要手动执行 notify() ，不过前提是 target 已经有关联 observer 实例
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 * 递归的把数组中每个元素的 dep 都添加到当前的 Dep.target 的订阅目标列表(deps)中，
 * 同时也把 Dep.target 添加到这些 dep 的订阅者列表(subs)中，从而建立双向的发布/订阅模式
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
