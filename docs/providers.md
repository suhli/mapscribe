# 地图数据提供方

| 接口 | 默认实现 | 用途 |
| --- | --- | --- |
| TileProvider | [OpenFreeMap](https://openfreemap.org) | 无需 Key 的 MapLibre 矢量样式 |
| GeocodingProvider | [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) | 地名和行政区定位 |
| RoadProvider | [Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API) | 按点击位置提取道路几何 |
| RoutingProvider | [OSRM 演示服](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server) | 沿路网连接起终点 |

这些公开服务都有使用政策。MapScribe 默认把 Nominatim 和 Overpass 的请求间隔放在 1.1 秒，并缓存结果。它们适合编辑器里的交互操作，不能当作无限制的批量出图后端。

大量渲染请在设置里改成自己的服务地址，或在项目里写：

```json
{
  "providers": {
    "geocoding": { "endpoint": "https://nominatim.example.com", "timeoutMs": 12000 },
    "roads": { "endpoint": "https://overpass.example.com/api/interpreter" },
    "routing": { "endpoint": "https://router.example.com" },
    "tiles": { "endpoint": "https://tiles.example.com" }
  }
}
```

底图也可以直接使用自定义 MapLibre Style URL。样式文件里的瓦片地址由你自己的服务决定。

OpenFreeMap 样式基于 OpenStreetMap 和 OpenMapTiles。导出的图片会保留 `© OpenStreetMap contributors` 与 OpenFreeMap / OpenMapTiles 署名。

点选道路时，如果 Overpass 不可用，编辑器会退回当前底图里已经画出来的线。这种几何可能在瓦片边界被截断，界面会说明这一点，并允许拖动节点修改。程序不会编造缺失的道路名称或几何。

坐标系使用 WGS84。不要把 GCJ-02 坐标直接写进项目。
