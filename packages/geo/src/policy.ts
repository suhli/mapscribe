/** 默认公开服务的使用约束。这些服务不能当作无限制的生产后端。 */
export const DEFAULT_ENDPOINTS = {
  geocoding: "https://nominatim.openstreetmap.org",
  overpass: "https://overpass-api.de/api/interpreter",
  routing: "https://router.project-osrm.org",
  tiles: "https://tiles.openfreemap.org",
} as const;

export const USER_AGENT = "MapScribe/0.1 (educational map editor)";

export const PROVIDER_POLICIES = {
  openfreemap: {
    title: "OpenFreeMap",
    homepage: "https://openfreemap.org",
    summary: "默认矢量底图。适合交互编辑和少量出图，批量渲染应自备瓦片或自定义样式。",
  },
  nominatim: {
    title: "Nominatim",
    homepage: "https://operations.osmfoundation.org/policies/nominatim/",
    summary: "公开地理编码实例仅供低频查询，默认间隔不少于 1.1 秒。",
  },
  overpass: {
    title: "Overpass API",
    homepage: "https://wiki.openstreetmap.org/wiki/Overpass_API",
    summary: "用于按点击位置提取道路几何。请限制频率，大批量任务应使用自建实例。",
  },
  osrm: {
    title: "OSRM 演示服务器",
    homepage: "https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server",
    summary: "公开路由服务只适合演示。它返回沿路网的几何，不能用来代替道路实体查询。",
  },
} as const;
