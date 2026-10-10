import { describe, expect, it } from "vitest";
import { deleteVertex, parseCoordinateQuery } from "./coordinates.js";
import { parseOsrmRoutes, RoutingError } from "./osrm.js";
import { parseOverpassWays } from "./overpass.js";
import { NominatimGeocoder } from "./nominatim.js";

describe("coordinates", () => {
  it("删除中间节点，并拒绝把折线删成单点", () => {
    const geometry = deleteVertex(
      {
        type: "LineString",
        coordinates: [
          [104, 30],
          [104.01, 30.01],
          [104.02, 30.015],
        ],
      },
      0,
      1,
    );
    expect(geometry?.type === "LineString" ? geometry.coordinates : []).toHaveLength(2);
    expect(
      deleteVertex(
        {
          type: "LineString",
          coordinates: [
            [104, 30],
            [104.01, 30.01],
          ],
        },
        0,
        0,
      ),
    ).toBeNull();
  });

  it("按经度、纬度解析，并在纬度超出范围时交换顺序", () => {
    expect(parseCoordinateQuery("104.08, 30.65")).toEqual([104.08, 30.65]);
    expect(parseCoordinateQuery("30.65, 104.08")).toEqual([104.08, 30.65]);
    expect(parseCoordinateQuery("不是坐标")).toBeNull();
  });
});

describe("parseOverpassWays", () => {
  it("把 Overpass 几何转换成 GeoJSON 顺序", () => {
    const ways = parseOverpassWays({
      elements: [
        {
          type: "way",
          id: 625875294,
          tags: { name: "西里", highway: "pedestrian" },
          geometry: [
            { lon: 104.0802545, lat: 30.6561263 },
            { lon: 104.080481, lat: 30.6564912 },
          ],
        },
      ],
    });
    expect(ways).toHaveLength(1);
    expect(ways[0]?.id).toBe("way/625875294");
    expect(ways[0]?.geometry.coordinates[0]).toEqual([104.0802545, 30.6561263]);
  });
});

describe("parseOsrmRoutes", () => {
  it("缺少路线时失败，并且不生成直线", () => {
    expect(() => parseOsrmRoutes({ code: "NoRoute", routes: [] })).toThrow(RoutingError);
    expect(() =>
      parseOsrmRoutes({
        code: "Ok",
        routes: [{ distance: 10, duration: 5, geometry: { type: "LineString", coordinates: [] } }],
      }),
    ).toThrow(/缺少道路几何/);
  });

  it("保留服务返回的中间点", () => {
    const routes = parseOsrmRoutes({
      code: "Ok",
      routes: [
        {
          distance: 1200,
          duration: 180,
          geometry: {
            type: "LineString",
            coordinates: [
              [104.06, 30.65],
              [104.07, 30.655],
              [104.08, 30.66],
            ],
          },
        },
      ],
    });
    expect(routes[0]?.geometry.coordinates).toHaveLength(3);
    expect(routes[0]?.summary).toContain("1.2 km");
  });
});

describe("NominatimGeocoder", () => {
  it("解析搜索结果", async () => {
    const geocoder = new NominatimGeocoder({
      minIntervalMs: 0,
      fetchFn: async () =>
        new Response(
          JSON.stringify([
            {
              display_name: "成都市",
              lat: "30.67",
              lon: "104.06",
              boundingbox: ["30.5", "30.8", "103.9", "104.2"],
            },
          ]),
        ),
    });
    const results = await geocoder.search("成都");
    expect(results[0]?.position).toEqual([104.06, 30.67]);
    expect(results[0]?.bounds).toEqual([103.9, 30.5, 104.2, 30.8]);
  });
});
