/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_URL: string
    readonly VITE_VIETMAP_API_KEY?: string
    readonly VITE_VIETMAP_TILE_API_KEY?: string
    readonly VITE_VIETMAP_STYLE?: string
    readonly VITE_USE_VIETMAP_TILES?: string
    readonly VITE_MAP_STYLE_URL?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}