/// <reference types="vite/client" />

// 補上自訂環境變數的型別，讓 import.meta.env.VITE_RSVP_ENDPOINT 有型別提示
interface ImportMetaEnv {
  readonly VITE_RSVP_ENDPOINT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
