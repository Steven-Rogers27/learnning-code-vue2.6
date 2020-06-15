/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}
/**
 * 经过 initState() 处理后，props, methods, data, computed, watch 在 vm 实例上都已经可以使用了
 * @param {*} vm 
 */
export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  if (opts.props) initProps(vm, opts.props)
  if (opts.methods) initMethods(vm, opts.methods)
  if (opts.data) {
    initData(vm)
  } else {
    // 如果开发者没有定义 data，就传一个 {} 作为 vm._data
    observe(vm._data = {}, true /* asRootData */)
  }
  if (opts.computed) initComputed(vm, opts.computed)
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}
// 结合子组件中的props定义和实际父组件传入的props值，把porps属性及其值在 vm._props 对象上定义成响应式属性，
// 同时在 vm 实例上也定义上这些 Props，只不过它还是操作的 vm._props 中的定义
function initProps (vm: Component, propsOptions: Object) {
  // vm.$options.propsData 是父组件实际传入的prop属性，
  // vm.$options.props 是开发者在子组件定义时声明的 props 对象，
  // 如果父组件没有传入某个prop（该prop不是 required 的），则 propsData 和 props 中的属性 key 就会不一致了，props 中是全量的，propsData 中可能会缺少
  // vm.$options.propsData 和 vm.$options.props 的形式不同，
  // propsData 是 {key: value} 形式的对象，key 就是开发者定义 props时的属性名 key，value 是实际的属性值，可能是配置的默认值，也可能是父组件传进来的值
  // props 还依然是开发者定义 props 时的样子，虽然也是 { key: value }，但是 vaule 是 { type: String, default: '', required: true } 这样的定义，也就是
  // props.js 中声明的 PropOptions 类型
  const propsData = vm.$options.propsData || {}
  // 会把 vm.$options.props 中的属性及其值，以响应式属性的方式定义到 vm._props 对象上
  const props = vm._props = {}
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  // _propKeys 中放的是 vm.$options.props 的属性 key 名，即便父组件没有实际传入某个prop（在propsData 中没有该key: value），
  // 但 _propKeys 中依然会和 props 保持一致，拥有全量的 key 名
  const keys = vm.$options._propKeys = []
  // vm.$parent 如果是 undefined，则 vm 就是根组件
  const isRoot = !vm.$parent
  // root instance props should be converted
  if (!isRoot) {
    toggleObserving(false)
  }
  for (const key in propsOptions) {
    keys.push(key)
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      // prop 属性名不能是 'key,ref,slot,slot-scope,is' 这些保留关键字
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      // 把 props 以响应式属性的形式定义在 vm._props 对象上
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      // 把 props 以响应式属性的形式定义在 vm._props 对象上
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      // 如果该 prop 属性在 vm 实例上还没有，则在 vm 上定义该 prop 属性，
      // 从 vm 上 get/set 该 prop 的值，实际上是 get/set vm._props 上的值，
      // 在上面看到，vm._props 上定义的 props 已经是响应式的，在开发环境下执行 set，会触发告警
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}

// 把开发者定义的 data 对象定义在 vm._data 上，以及 vm 自身上，同时递归的给整个 data 关联上 observer 对象
function initData (vm: Component) {
  let data = vm.$options.data
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  while (i--) {
    const key = keys[i]
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      // 只要 key 不是 _ 或者 $ 开头的保留属性名，就把这些 data 也在 vm 实例上定义一遍，只不过还是操作的 vm._data 中的值
      proxy(vm, `_data`, key)
    }
  }
  // observe data
  // 给 data 对象关联 observer 对象
  observe(data, true /* asRootData */)
}

export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  // 把全局唯一的 Dep.target 这个watcher 置为 undefined
  pushTarget()
  try {
    // 用当前 vm 实例作为 this 调用data函数，同时把 vm 作为参数传入
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true }
// 1. 给每个 computed 属性在 vm._computedWatchers 中创建一个对应的 watcher 对象
// 2. 把每个 computed 属性定义在 vm 实例上
function initComputed (vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  for (const key in computed) {
    const userDef = computed[key]
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) {
      // create internal watcher for the computed property.
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  const shouldCache = !isServerRendering()
  if (typeof userDef === 'function') {
    // 如果开发者是以函数的形式定义的该 compute:
    // 如果不是服务端渲染，该 compute 属性的值从 vm._computedWatchers 中对应的 watcher 对象中获取
    // 如果是服务端渲染，则通过开发者给该 compute 属性自定义的计算函数计算而来
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef)
    sharedPropertyDefinition.set = noop
  } else {
    // 如果开发者是以对象 { get: fn, set: fn } 的形式定义的该 compute:
    // 1. 有定义 get 函数
    // 2. 不是服务端渲染
    // 3. 有定义 cache === true
    // 满足上面3个条件时，该 compute 的值从 vm._computedWatchers 中对应的 watcher 对象中获取
    // 1. 有定义 get 函数
    // 2. 是服务端渲染 || 没有定义 cache === true
    // 满足上面3个条件时，该 compute 的值通过开发者定义的 get 函数计算而来
    // 1. 没有定义 get 函数
    // 则 get 函数是个什么也不做的空函数
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  // 把这个 compute 属性定义到当前 vm 实例上
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

function createComputedGetter (key) {
  return function computedGetter () {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      if (watcher.dirty) {
        watcher.evaluate()
      }
      if (Dep.target) {
        watcher.depend()
      }
      return watcher.value
    }
  }
}

function createGetterInvoker(fn) {
  return function computedGetter () {
    return fn.call(this, this)
  }
}

// 把 methods 中定义的每个方法转成内部 this 指向当前 vm 实例的函数
function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm) // 调用 Function.prototype.bind 把 method 的内部this绑定为 vm 实例，然后返回 bind 生成的新函数
  }
}
/**
 * 通过在 vm 实例上执行 vm.$watch() 方法，把开发者配置的 watch 都在 vm 上创建一个对应的 Watcher 实例
 * @param {*} vm 
 * @param {*} watch 
 */
function initWatch (vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  // 这里定义的 $data, $props 还是从经过 initData() 和 initProps() 产生的 _data 和 _props 中获取值，
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    options.user = true
    const watcher = new Watcher(vm, expOrFn, cb, options)
    if (options.immediate) {
      try {
        cb.call(vm, watcher.value)
      } catch (error) {
        handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`)
      }
    }
    return function unwatchFn () {
      watcher.teardown()
    }
  }
}
