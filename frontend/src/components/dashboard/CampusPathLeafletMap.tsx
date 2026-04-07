"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Tooltip, Popup, useMap } from "react-leaflet";
import type { PlottedItem } from "./CampusPathMap";

function fmt12(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr ?? "0", 10);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function getGoogleMapsUrl(locationName: string) {
  const query = `${locationName}, UC San Diego`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
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

function makeSequenceIcon(order: number, uncertain = false, highlighted = false) {
  const label = String(order);
  const cls = highlighted
    ? "rp-seq-icon__inner rp-seq-icon__inner--highlighted"
    : uncertain
    ? "rp-seq-icon__inner rp-seq-icon__inner--uncertain"
    : "rp-seq-icon__inner";
  return L.divIcon({
    className: "rp-seq-icon",
    html: `<div class="${cls}">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

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

function FitToData({
  points,
}: {
  points: Array<{ lat: number; lng: number }>;
}) {
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
  const fitPoints = useMemo(
    () => [...plottedItems.map((item) => ({ lat: item.lat, lng: item.lng }))],
    [plottedItems],
  );

  const sequenceIcons = useMemo(
    () => plottedItems.map((item, index) => {
      const highlighted = highlightedDossierId != null && item.id.startsWith(highlightedDossierId + "-");
      return makeSequenceIcon(index + 1, item.geocode_status === "unresolved", highlighted);
    }),
    [plottedItems, highlightedDossierId],
  );

  // Detect items sharing the same lat/lng (different courses, same building)
  const locationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of plottedItems) {
      const k = `${item.lat.toFixed(5)},${item.lng.toFixed(5)}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  }, [plottedItems]);

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

        {plottedItems.map((item, index) => (
          <Marker
            key={`${item.id}-${index}`}
            position={[item.lat, item.lng]}
            icon={sequenceIcons[index]}
          >
            <Tooltip direction="top" offset={[0, -20]} opacity={1} className="rp-tooltip">
              <div className="rp-tooltip__title">{item.title}</div>
              {item.location && (
                <div className="rp-tooltip__sub">{item.location}</div>
              )}
              {item.days?.length > 0 && (
                <div className="rp-tooltip__sub">{item.days.join(" · ")}</div>
              )}
              {item.start && item.end && (
                <div className="rp-tooltip__time">{fmt12(item.start)} — {fmt12(item.end)}</div>
              )}
            </Tooltip>
            <Popup className="rp-dark-popup">
              <div style={{ minWidth: 220, padding: "12px 14px" }}>
                {/* Header row: title + order badge */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{item.title}</div>
                    {item.location && (
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
                        {item.buildingDisplayName ? `${item.buildingDisplayName} · ` : ""}{item.location}
                      </div>
                    )}
                  </div>
                  <span style={{ flexShrink: 0, background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.22)", borderRadius: 6, padding: "2px 7px", fontSize: 11, color: "#00d4ff", fontWeight: 600 }}>
                    #{index + 1}
                  </span>
                </div>

                {/* Days */}
                {item.days?.length > 0 && (
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>
                    {item.days.join(" · ")}
                  </div>
                )}

                {/* Time */}
                {item.start && item.end && (
                  <div style={{ fontSize: 12, color: "#00d4ff", fontWeight: 600, marginBottom: 10 }}>
                    {fmt12(item.start)} — {fmt12(item.end)}
                  </div>
                )}

                {locationCounts.get(`${item.lat.toFixed(5)},${item.lng.toFixed(5)}`)! > 1 && (
                  <div style={{ fontSize: 11, color: "#fcd34d", marginBottom: 8 }}>
                    Multiple classes meet here
                  </div>
                )}

                {/* Google Maps link */}
                <a
                  href={getGoogleMapsUrl(item.buildingDisplayName ?? item.location ?? item.title)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#00d4ff", fontWeight: 500, textDecoration: "none", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8, width: "100%" }}
                >
                  Open in Google Maps ↗
                </a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/[0.16] bg-slate-950/55 px-2 py-1 text-[11px] text-hub-text-muted">
        Drag to pan · scroll to zoom
      </div>
    </div>
  );
}
