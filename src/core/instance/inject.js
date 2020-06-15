/* @flow */

import { hasOwn } from 'shared/util'
import { warn, hasSymbol } from '../util/index'
import { defineReactive, toggleObserving } from '../observer/index'

export function initProvide (vm: Component) {
  const provide = vm.$options.provide
  if (provide) {
    vm._provided = typeof provide === 'function'
      ? provide.call(vm)
      : provide
  }
}

export function initInjections (vm: Component) {
  // 把 inject 解析成新的对象，该对象是 { key: value } 形式，
  // key 就是原来 inject 对象中的属性名 key，
  // value 就是要注入的这个属性的实际值，而不再是原先 inject 中的 {from: 'key', default: 123} 样子
  const result = resolveInject(vm.$options.inject, vm)
  if (result) {
    // 把 observer 中的 shouldObserve 标记置为 false，此时 observe() 函数就暂时不能再给一个新的值关联 observer 对象
    // 还没理解这里为啥要关掉 shouldObserve
    toggleObserving(false)
    Object.keys(result).forEach(key => {
      // 把处理后的 inject 对象中的 <key, value> 以响应式属性的形式添加到当前 vm 实例上
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production') {
        defineReactive(vm, key, result[key], () => {
          warn(
            `Avoid mutating an injected value directly since the changes will be ` +
            `overwritten whenever the provided component re-renders. ` +
            `injection being mutated: "${key}"`,
            vm
          )
        })
      } else {
        defineReactive(vm, key, result[key])
      }
    })
    // 恢复 shouldObserve 标记
    toggleObserving(true)
  }
}

export function resolveInject (inject: any, vm: Component): ?Object {
  if (inject) {
    // inject is :any because flow is not smart enough to figure out cached
    const result = Object.create(null)
    const keys = hasSymbol
      ? Reflect.ownKeys(inject)
      : Object.keys(inject)

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      // #6574 in case the inject object is observed...
      if (key === '__ob__') continue
      const provideKey = inject[key].from
      let source = vm
      // 从 vm 自身开始，沿着 $parent 遍历其父组件，从 _provided 对象中找相应 provideKey 所对应的定义，
      // 应该就是开发者在 provide 对象（或者通过函数所返回的对象）中配置的 <key: value> 值。
      // vm._provided 对象应该就是经过处理的 provide 对象。
      while (source) {
        if (source._provided && hasOwn(source._provided, provideKey)) {
          result[key] = source._provided[provideKey]
          break
        }
        source = source.$parent
      }
      // 如果跳出 while 循环后 source 变成 undefined 了，说明在所有的 provide 中没有找到当前 provideKey 这个字符串所定义属性值
      // 此时就看当前 inject[key] 这个对象中有没有配置 default 值，如果有就用它，没有的话，开发环境就会给出告警
      if (!source) {
        // 在 Vue.prototype._init() 中经过 mergeOptions() 的处理，inject 中的属性值已经都是对象形式，e.g. {from: 'key'}
        if ('default' in inject[key]) {
          const provideDefault = inject[key].default
          // default 的值还可以是函数，此时会用当前组件实例 vm 作为函数内的 this 来执行该函数
          result[key] = typeof provideDefault === 'function'
            ? provideDefault.call(vm)
            : provideDefault
        } else if (process.env.NODE_ENV !== 'production') {
          warn(`Injection "${key}" not found`, vm)
        }
      }
    }
    return result
  }
}
