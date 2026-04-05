"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, useMap } from "react-leaflet";
import type { PlottedItem } from "./CampusPathMap";

type CampusPathLeafletMapProps = {
  plottedItems: PlottedItem[];
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

function makeSequenceIcon(order: number) {
  const label = String(order);
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width: 24px; height: 24px;
        border-radius: 999px;
        background: rgba(34, 211, 238, 0.95);
        border: 2px solid rgba(255,255,255,0.9);
        box-shadow: 0 0 0 3px rgba(8, 47, 73, 0.35);
        color: #062132;
        font-weight: 700;
        font-size: 11px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">${label}</div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
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
}: CampusPathLeafletMapProps) {
  const fitPoints = useMemo(
    () => [...plottedItems.map((item) => ({ lat: item.lat, lng: item.lng }))],
    [plottedItems],
  );

  const sequenceIcons = useMemo(
    () => plottedItems.map((_, index) => makeSequenceIcon(index + 1)),
    [plottedItems],
  );

  return (
    <div className="relative h-[420px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#071124]">
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
            key={item.id}
            position={[item.lat, item.lng]}
            icon={sequenceIcons[index]}
            title={item.location ?? item.title}
          />
        ))}
      </MapContainer>

      <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/[0.16] bg-slate-950/55 px-2 py-1 text-[11px] text-hub-text-muted">
        Drag to pan · scroll to zoom
      </div>
    </div>
  );
}
