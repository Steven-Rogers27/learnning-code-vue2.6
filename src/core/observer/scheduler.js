/* @flow */

import type Watcher from './watcher'
import config from '../config'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import {
  warn,
  nextTick,
  devtools,
  inBrowser,
  isIE
} from '../util/index'

export const MAX_UPDATE_COUNT = 100

const queue: Array<Watcher> = []
const activatedChildren: Array<Component> = []
let has: { [key: number]: ?true } = {}
let circular: { [key: number]: number } = {}
let waiting = false
let flushing = false
let index = 0 // 全局下标，记录当前处理到 watcher 队列中的第几个 watcher

/**
 * Reset the scheduler's state.
 */
function resetSchedulerState () {
  index = queue.length = activatedChildren.length = 0
  has = {}
  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  waiting = flushing = false
}

// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
export let currentFlushTimestamp = 0

// Async edge case fix requires storing an event listener's attach timestamp.
let getNow: () => number = Date.now

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
// hi-res 表示用的是 performance.now() 获取的自页面 load 完成开始到现在的毫秒数，
// low-res 表示用的是 Date.now() 获取的UTC毫秒值
// IE9 及以下的 window.performance 对象上没有 now 方法
if (inBrowser && !isIE) {
  const performance = window.performance
  if (
    performance &&
    typeof performance.now === 'function' &&
    getNow() > document.createEvent('Event').timeStamp
  ) {
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    getNow = () => performance.now()
  }
}

/**
 * Flush both queues and run the watchers.
 */
function flushSchedulerQueue () {
  currentFlushTimestamp = getNow()
  flushing = true
  let watcher, id

  // 按 watcher 创建的先后顺序排序
  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)
  // 渲染 watcher 指的应该就是 mountComponent() 函数中，在 beforeMount 和 mounted 之间
  // 给组件实例 vm 上添加的 vm._watcher
  // 用户 watcher 应该就是组件实例中开发人员在 watch 属性，或者通过 this.$watch() 添加的 watcher,
  // 用户 watcher 是在 Vue.prototype._init() 方法中，beforeCreate 和 created 之间创建的，渲染 watcher 是在
  // beforeMount 和 mounted 之间创建的。所以说，用户 watcher 在 渲染 watcher 之前创建
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.
  queue.sort((a, b) => a.id - b.id)

  // do not cache length because more watchers might be pushed
  // as we run existing watchers
  // 在 flushSchedulerQueue 执行期间，还会有新的 watcher 通过 queueWatcher 插入队列（只要有订阅者 watcher 收到订阅对象 dep 的变化通知，这个 watcher 就会插入队列）
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index]
    // 比如在定义组件的渲染 watcher 时，定义了 watcher.before（其中是执行 beforeUpdate 钩子函数）
    if (watcher.before) {
      watcher.before()
    }
    id = watcher.id
    has[id] = null
    watcher.run() // 执行 watcher 的回调函数
    // in dev build, check and stop circular updates.
    // 条件中的 has[id] != null 看起来和上面的 has[id] = null 是矛盾的，
    // 其实，has[id] = null 在 watcher.run() 之前，表示一旦这个 watcher 开始执行它的 run 方法了，queueWatcher() 那边就可以再次把这个 watcher 加入队列了（参看
    // queueWatcher 的条件判断），此时当 watcher.run() 执行完成时，has[id] 就是 true，这时就要开始统计这个 watcher 被执行的次数了，因为有可能是 watcher.run() 执行
    // 过程中又修改了该 watcher 自己的订阅对象 dep 所关联的值，进而 dep 又通知该 watcher，watcher 又被加入队列。这就造成了死循环更新。
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' + (
            watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`
          ),
          watcher.vm
        )
        break
      }
    }
  }

  // keep copies of post queues before resetting state
  const activatedQueue = activatedChildren.slice()
  const updatedQueue = queue.slice()
  // 上面的 for 循环执行完了，也就是本轮的 watcher 队列清理完了，此时把 watcher 队列、actived 队列置空。
  resetSchedulerState()

  // call component updated and activated hooks
  // 激活 actived 队列中的组件
  callActivatedHooks(activatedQueue)
  // 检查 watcher 队列中如果有渲染 watcher（更新整个组件的 watcher），则调用渲染 watcher 所对应的组件的 updated 钩子函数
  // 在上面 for 循环一开始，通过 watcher.before() 执行了组件的 beforeUpdate 钩子函数
  callUpdatedHooks(updatedQueue)

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

function callUpdatedHooks (queue) {
  let i = queue.length
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    if (vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'updated')
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
export function queueActivatedComponent (vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false
  activatedChildren.push(vm)
}

function callActivatedHooks (queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 */
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id
  if (has[id] == null) {
    has[id] = true
    if (!flushing) {
      // 没有正在清理队列中的 watcher 回调时，把新加入的 watcher 插在队列的末尾
      queue.push(watcher)
    } else {
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.
      let i = queue.length - 1
      // 当正在执行 flushSchedulerQueue() 清理 watcher 队列时，新加入的 watcher 按id由小到大的顺序（也就是watcher创建的顺序）插入它应该在的位置，
      // 但同时，新插入的这个 watcher 不能插在当前正在处理的 watcher 之前（index 标识着队列中当前正在处理的 watcher 的下标），因为 index 之前的 watcher
      // 在本轮清理中已经处理过了，此时再插到 index 之前，则不会在本轮清理中处理这个新插入的 watcher
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      queue.splice(i + 1, 0, watcher) // 把 watcher 按 id 由小到大的顺序插入 queue
    }
    // queue the flush
    // waiting 是一个锁，当一轮 flushSchedulerQueue 还没执行完时，不能开始下一轮
    if (!waiting) {
      waiting = true

      if (process.env.NODE_ENV !== 'production' && !config.async) {
        // 在开发环境下，全局设置了采用同步更新方式时，才会立马清理 watcher 队列
        flushSchedulerQueue()
        return
      }
      // 在绝大多数情况下，都是把清理 watcher 队列的动作放进微任务队列，
      nextTick(flushSchedulerQueue)
    }
  }
}
