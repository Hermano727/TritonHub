"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Tooltip, useMap } from "react-leaflet";
import type { PlottedItem } from "./CampusPathMap";

function fmt12(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr ?? "0", 10);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

type CampusPathLeafletMapProps = {
  plottedItems: PlottedItem[];
  highlightedDossierId?: string | null;
};

type TileLayerOptions = {
  maxZoom: number;
  minZoom: number;
  subdomains: string;
  crossOrigin: boolean;
  attribution: string;
};

const DEFAULT_CENTER: [number, number] = [32.8801, -117.234];
const LOCAL_TILE_URL = "/tiles/{z}/{x}/{y}.png";
const REMOTE_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const TILE_OPTIONS: TileLayerOptions = {
  maxZoom: 17,
  minZoom: 12,
  subdomains: "abc",
  crossOrigin: true,
  attribution: "&copy; OpenStreetMap contributors",
};

/** Single-class marker: shows the marker number */
function makeSingleIcon(num: number, uncertain = false, highlighted = false) {
  const cls = highlighted
    ? "rp-seq-icon__inner rp-seq-icon__inner--highlighted"
    : uncertain
    ? "rp-seq-icon__inner rp-seq-icon__inner--uncertain"
    : "rp-seq-icon__inner";
  return L.divIcon({
    className: "rp-seq-icon",
    html: `<div class="${cls}">${num}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

/** Multi-class marker: shows count with a stacked badge style */
function makeMultiIcon(count: number, highlighted = false) {
  const cls = highlighted
    ? "rp-seq-icon__inner rp-seq-icon__inner--highlighted rp-seq-icon__inner--multi"
    : "rp-seq-icon__inner rp-seq-icon__inner--multi";
  return L.divIcon({
    className: "rp-seq-icon",
    html: `<div class="${cls}"><span class="rp-seq-icon__count">${count}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

/** A group of courses that share the same lat/lng (same building) */
type LocationGroup = {
  key: string;
  lat: number;
  lng: number;
  items: PlottedItem[];
};

class FallbackTileLayer extends L.TileLayer {
  private localUrl: string;
  private remoteUrl: string;
  private localOptions: TileLayerOptions;

  constructor(localUrl: string, remoteUrl: string, options: TileLayerOptions) {
    super(localUrl, options);
    this.localUrl = localUrl;
    this.remoteUrl = remoteUrl;
    this.localOptions = options;
  }

  private getSubdomain(coords: L.Coords) {
    const subs = this.localOptions.subdomains;
    if (!subs?.length) return "a";
    const index = Math.abs((coords.x + coords.y) % subs.length);
    return subs[index] ?? "a";
  }

  private urlFor(template: string, coords: L.Coords) {
    return L.Util.template(template, {
      ...coords,
      s: this.getSubdomain(coords),
      r: L.Browser.retina ? "@2x" : "",
    });
  }

  createTile(coords: L.Coords, done: L.DoneCallback) {
    const tile = document.createElement("img");
    tile.alt = "";
    tile.setAttribute("role", "presentation");
    tile.className = "leaflet-tile";
    tile.decoding = "async";
    if (this.options.crossOrigin) tile.crossOrigin = "";

    const localSrc = this.urlFor(this.localUrl, coords);
    const remoteSrc = this.urlFor(this.remoteUrl, coords);

    tile.onload = () => done(undefined, tile);
    tile.onerror = () => {
      if (tile.src === remoteSrc) {
        done(new Error("Tile failed from both local and remote"), tile);
        return;
      }
      tile.src = remoteSrc;
    };

    tile.src = localSrc;
    return tile;
  }
}

function HybridTileLayer() {
  const map = useMap();

  useEffect(() => {
    const layer = new FallbackTileLayer(LOCAL_TILE_URL, REMOTE_TILE_URL, TILE_OPTIONS);
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map]);

  return null;
}

function FitToData({ points }: { points: Array<{ lat: number; lng: number }> }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) {
      map.setView(DEFAULT_CENTER, 15, { animate: false });
      return;
    }
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 16, { animate: false });
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds.pad(0.2), { animate: false });
  }, [map, points]);

  return null;
}

export function CampusPathLeafletMap({
  plottedItems,
  highlightedDossierId,
}: CampusPathLeafletMapProps) {
  // Group items sharing the same lat/lng into one map pin
  const locationGroups = useMemo<LocationGroup[]>(() => {
    const groups = new Map<string, LocationGroup>();
    for (const item of plottedItems) {
      const k = `${item.lat.toFixed(4)},${item.lng.toFixed(4)}`;
      if (!groups.has(k)) {
        groups.set(k, { key: k, lat: item.lat, lng: item.lng, items: [] });
      }
      groups.get(k)!.items.push(item);
    }
    return [...groups.values()];
  }, [plottedItems]);

  const fitPoints = useMemo(
    () => locationGroups.map((g) => ({ lat: g.lat, lng: g.lng })),
    [locationGroups],
  );

  return (
    <div className="relative h-[280px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#071124]">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={15}
        minZoom={TILE_OPTIONS.minZoom}
        maxZoom={TILE_OPTIONS.maxZoom}
        zoomControl={false}
        className="h-full w-full"
      >
        <HybridTileLayer />
        <FitToData points={fitPoints} />

        {locationGroups.map((group) => {
          const isMulti = group.items.length > 1;
          const isHighlighted =
            highlightedDossierId != null &&
            group.items.some((item) => item.id.startsWith(highlightedDossierId + "-"));
          const isUncertain = group.items.some(
            (item) => item.geocode_status === "unresolved",
          );

          const icon = isMulti
            ? makeMultiIcon(group.items.length, isHighlighted)
            : makeSingleIcon(
                group.items[0].markerNum || 1,
                isUncertain,
                isHighlighted,
              );

          return (
            <Marker
              key={group.key}
              position={[group.lat, group.lng]}
              icon={icon}
            >
              <Tooltip
                direction="top"
                offset={[0, isMulti ? -24 : -20]}
                opacity={1}
                className="rp-tooltip rp-tooltip--multi"
              >
                {isMulti ? (
                  <>
                    <div className="rp-tooltip__multi-header">
                      {group.items.length} classes here
                    </div>
                    {group.items.map((item) => (
                      <div key={item.id} className="rp-tooltip__multi-row">
                        <span className="rp-tooltip__num">
                          {item.markerNum || "·"}
                        </span>
                        <span>
                          <div className="rp-tooltip__title">{item.title}</div>
                          {item.days?.length > 0 && (
                            <div className="rp-tooltip__sub">
                              {item.days.join(" · ")}{" "}
                              {item.start && item.end
                                ? `· ${fmt12(item.start)}–${fmt12(item.end)}`
                                : ""}
                            </div>
                          )}
                        </span>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="rp-tooltip__title">{group.items[0].title}</div>
                    {group.items[0].location && (
                      <div className="rp-tooltip__sub">{group.items[0].location}</div>
                    )}
                    {group.items[0].days?.length > 0 && (
                      <div className="rp-tooltip__sub">
                        {group.items[0].days.join(" · ")}
                      </div>
                    )}
                    {group.items[0].start && group.items[0].end && (
                      <div className="rp-tooltip__time">
                        {fmt12(group.items[0].start)} — {fmt12(group.items[0].end)}
                      </div>
                    )}
                  </>
                )}
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>

      <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/[0.16] bg-slate-950/55 px-2 py-1 text-[11px] text-hub-text-muted">
        Hover pins · scroll to zoom
      </div>
    </div>
  );
}
