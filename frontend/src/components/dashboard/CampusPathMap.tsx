"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle } from "lucide-react";
import type { ScheduleItem, TransitionInsight } from "@/types/dossier";
import { campusLocations } from "@/lib/mock/campusLocations";

type CampusPathMapProps = {
  scheduleItems: ScheduleItem[];
  transitionInsights: TransitionInsight[];
  highlightedDossierId?: string | null;
  /** Dossier ID → sequential display-order marker number */
  dossierMarkerMap?: Map<string, number>;
};

export type PlottedItem = ScheduleItem & {
  lat: number;
  lng: number;
  /** All days this course meets at this location, e.g. ["Mon","Wed","Fri"] */
  days: string[];
  /** Sequential marker number derived from dossier display order */
  markerNum: number;
};

const CampusPathLeafletMap = dynamic(
  () =>
    import("./CampusPathLeafletMap").then((mod) => ({
      default: mod.CampusPathLeafletMap,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[340px] items-center justify-center rounded-xl border border-white/[0.08] bg-[#071124] text-sm text-hub-text-muted">
        Loading interactive map...
      </div>
    ),
  },
);


export function CampusPathMap({
  scheduleItems,
  transitionInsights: _transitionInsights,
  highlightedDossierId,
  dossierMarkerMap,
}: CampusPathMapProps) {
  void _transitionInsights;

  const locationMap = useMemo(
    () => new Map(campusLocations.map((loc) => [loc.code, loc])),
    [],
  );

  // Deduplicate by (title + buildingCode/location) so MWF lectures become one map pin.
  // Collect all days for each unique course-location pair.
  // Resolve markerNum from dossierMarkerMap by matching item.id prefix to dossier ID.
  const plottedMap = new Map<string, PlottedItem>();
  for (const item of scheduleItems) {
    let lat: number | undefined = item.lat;
    let lng: number | undefined = item.lng;
    if ((lat == null || lng == null) && item.buildingCode) {
      const loc = locationMap.get(item.buildingCode);
      if (loc) { lat = loc.lat; lng = loc.lng; }
    }
    if (lat == null || lng == null) continue;

    // Resolve marker number: find which dossier this scheduleItem belongs to
    let markerNum = 0;
    if (dossierMarkerMap) {
      for (const [dossierId, num] of dossierMarkerMap) {
        if (item.id.startsWith(dossierId + "-")) { markerNum = num; break; }
      }
    }

    const key = `${item.title}|${item.buildingCode ?? item.location ?? ""}`;
    if (plottedMap.has(key)) {
      const existing = plottedMap.get(key)!;
      if (!existing.days.includes(item.day)) existing.days.push(item.day);
    } else {
      plottedMap.set(key, { ...item, lat, lng, days: [item.day], markerNum });
    }
  }
  const plottedItems = [...plottedMap.values()];


  return (
    <section className="glass-panel rounded-xl border border-white/[0.08] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-[family-name:var(--font-outfit)] text-sm font-semibold text-hub-text">
          Campus path map
        </h2>
        <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">
          Estimated route
        </span>
        {plottedItems.some((i) => i.geocode_status === "unresolved") && (
          <span className="flex items-center gap-1 text-[11px] text-amber-400">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            Some pins are approximate
          </span>
        )}
      </div>

      <CampusPathLeafletMap plottedItems={plottedItems} highlightedDossierId={highlightedDossierId} />
    </section>
  );
}
