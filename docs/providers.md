# 地图数据提供方

| 接口 | 默认实现 | 用途 |
| --- | --- | --- |
| TileProvider | [OpenFreeMap](https://openfreemap.org) | 无需 Key 的 MapLibre 矢量样式 |
| GeocodingProvider | [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) | 地名和行政区定位 |
| RoadProvider | [Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API) | 按名称或位置提取道路几何 |
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

项目内部和渲染都使用 WGS84，顺序是 `[经度, 纬度]`。上述公开服务返回的也是 WGS84，Geo Resolver 不会对它们做二次纠偏。只有 `sourceQuery` 里的坐标锚点写了 `crs: "GCJ02"` 或 `"BD09"` 时，才会先转换成 WGS84。中国范围外的坐标保持原值。

按道路名称查询需要城市或矩形范围，避免对公共 Overpass 做无边界搜索。请求有超时、重试、间隔和缓存。服务失败时解析状态是 `provider_error`，不会用猜测坐标继续画图。
