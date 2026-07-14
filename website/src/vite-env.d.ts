/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONTRACT_ADDRESS: string
  readonly VITE_REOWN_PROJECT_ID: string
  readonly VITE_CHAIN_ID?: string
  readonly VITE_FALLBACK_RPC_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
