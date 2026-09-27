/** 启动就绪旗标：由 bootstrap 写入，供各 ready 探针读取（避免与 bootstrap 循环依赖） */
let bootstrapReadyFlag = false
let bootstrapFinishedFlag = false
let bootstrapConfigReadyFlag = false

export function setBootstrapReadyFlags(opts: {
  ready: boolean
  finished: boolean
  configReady: boolean
}): void {
  bootstrapReadyFlag = opts.ready
  bootstrapFinishedFlag = opts.finished
  bootstrapConfigReadyFlag = opts.configReady
}

export function getBootstrapReadyFlag(): boolean {
  return bootstrapReadyFlag
}

export function getBootstrapFinishedFlag(): boolean {
  return bootstrapFinishedFlag
}

export function getBootstrapConfigReadyFlag(): boolean {
  return bootstrapConfigReadyFlag
}

export function ready_rb_l0_infra_init_01(): boolean {
  return getBootstrapFinishedFlag()
}
