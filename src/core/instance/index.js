import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  this._init(options)
}

initMixin(Vue) // 定义 Vue.prototype._init() 方法
stateMixin(Vue) // 在 Vue.prototype 上定义 $data, $props, $set, $del, $watch
eventsMixin(Vue) // 在 Vue.prototype 上定义 $on, $once, $off, $emit
lifecycleMixin(Vue) // 在 Vue.prototype 上定义 _update, $forceUpdate, $destroy 方法
renderMixin(Vue) // 在 Vue.prototype 上定义 $nextTick，_render，

export default Vue
