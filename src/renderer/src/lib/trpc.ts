import { createTRPCProxyClient } from '@trpc/client'
import { ipcLink } from 'electron-trpc/renderer'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../../shared/ipc/router'

export type AppRouterOutput = inferRouterOutputs<AppRouter>

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [ipcLink()]
})
