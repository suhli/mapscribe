export { MemoryCache } from "./cache.js";
export { gcj02ToWgs84, toWgs84, wgs84ToGcj02 } from "./crs.js";
export type { AxisOrderCrs } from "./crs.js";
export {
  boundsOfGeometry,
  boundsOfLayer,
  boundsOfProject,
  deleteVertex,
  distanceToGeometryMeters,
  distanceToSegmentMeters,
  expandBounds,
  geometryLines,
  haversineMeters,
  insertVertex,
  moveVertex,
  parseCoordinateQuery,
} from "./coordinates.js";
export type { BBox } from "./coordinates.js";
export { requestJson } from "./http.js";
export { NominatimGeocoder } from "./nominatim.js";
export { OsrmRoutingProvider, RoutingError, formatRouteSummary, parseOsrmRoutes } from "./osrm.js";
export { OverpassRoadProvider, parseOverpassWays } from "./overpass.js";
export { DEFAULT_ENDPOINTS, PROVIDER_POLICIES, USER_AGENT } from "./policy.js";
export { RateLimiter } from "./rate-limit.js";
export { TILE_STYLES, findTileStyle } from "./tiles.js";
export { createDefaultResolver, createOsmCatalog, projectNeedsResolution, resolveProject } from "./resolve-project.js";
export type { LayerResolutionReport, ProjectResolution } from "./resolve-project.js";
export { AMBIGUOUS_SCOPE_REASON, AmbiguousScopeError, chooseAreaBounds, createGeoResolver } from "./resolver.js";
export type {
  AnchorQuery,
  GeoCatalog,
  GeoResolver,
  IntersectionQuery,
  NearbyRoadsQuery,
  PlaceQuery,
  ResolutionCandidate,
  ResolutionResult,
  ResolutionStatus,
  ResolvedIntersection,
  ResolvedPlace,
  RoadQuery,
  RoadSegmentQuery,
  RouteQuery,
} from "./resolver.js";
export { ProviderRequestError } from "./types.js";
export type {
  FetchLike,
  GeocodeResult,
  GeocodingProvider,
  ProviderEndpoint,
  RoadProvider,
  RoadWay,
  RouteAlternative,
  RoutingProvider,
  TileStyleOption,
} from "./types.js";
