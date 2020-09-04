/* @flow */

import { _Set as Set, isObject } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'

const seenObjects = new Set()

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 */
export function traverse (val: any) {
  // 递归的把val数组/对象自身的，及其内部每个元素/属性所关联的observer对象中的dep的id添加到seenObjects中。
  _traverse(val, seenObjects)
// 这里不明白的是，刚刚递归把所有的dep.id全部加入seenObjects中，立马又给清掉了，这是为啥？？
  seenObjects.clear() // 不能理解！！为什么刚收集到 seenObjects 中，又要把 seenObjects 清空
}

function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }
  if (val.__ob__) {
    const depId = val.__ob__.dep.id
    if (seen.has(depId)) {
      return
    }
    // 把每个 val 值所关联的 observer 对象的 depId 收集起来
    seen.add(depId)
  }
  if (isA) {
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else {
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
