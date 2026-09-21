export type IpcAuthorization = {
  authorized: boolean
  reason: string | null
}

export type AppRouterContext = {
  ipc?: IpcAuthorization
}
