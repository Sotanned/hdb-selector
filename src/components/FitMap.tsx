"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { bandOf, ramp } from "@/lib/mapPalette";
import { ONEMAP_ATTRIBUTION, ONEMAP_TILE_URL } from "@/lib/onemap";

export type MapCell = {
  lat: number;
  lng: number;
  fit: number;
  townIndex: number;
};

export type HoverInfo = { cell: MapCell; x: number; y: number };

/**
 * Renders a few thousand scored grid cells over a OneMap basemap.
 *
 * The cells are painted onto one canvas positioned in Leaflet's overlay pane
 * rather than added as thousands of individual layers: recolouring on every
 * weight change then costs a single redraw instead of a style update per cell.
 */
/**
 * The OS colour scheme is external state, so it is subscribed to rather than
 * mirrored into React state from an effect. The ramp's anchor flips with it.
 */
function usePrefersDark(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
}

export function FitMap({
  cells,
  thresholds,
  cellSizeM,
  onHover,
  onSelect,
}: {
  cells: MapCell[];
  thresholds: number[];
  cellSizeM: number;
  onHover: (info: HoverInfo | null) => void;
  onSelect: (cell: MapCell) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const leafletRef = useRef<typeof L | null>(null);
  const stateRef = useRef({ cells, thresholds, cellSizeM });
  const [ready, setReady] = useState(false);
  const dark = usePrefersDark();

  stateRef.current = { cells, thresholds, cellSizeM };

  // Leaflet touches `window` at import time, so it can only be loaded here.
  useEffect(() => {
    let disposed = false;

    (async () => {
      const leaflet = (await import("leaflet")).default;
      if (disposed || !containerRef.current || mapRef.current) return;
      leafletRef.current = leaflet;

      const map = leaflet.map(containerRef.current, {
        center: [1.354, 103.82],
        zoom: 12,
        minZoom: 11,
        maxZoom: 16,
        zoomControl: true,
        attributionControl: true,
        // Keep the viewport over Singapore; there is nothing to show elsewhere.
        maxBounds: leaflet.latLngBounds([1.15, 103.55], [1.52, 104.15]),
        maxBoundsViscosity: 0.8,
      });

      leaflet
        .tileLayer(ONEMAP_TILE_URL, {
          attribution: ONEMAP_ATTRIBUTION,
          maxZoom: 18,
        })
        .addTo(map);

      const canvas = leaflet.DomUtil.create("canvas", "fit-grid-canvas") as HTMLCanvasElement;
      canvas.style.position = "absolute";
      canvas.style.pointerEvents = "none";
      map.getPanes().overlayPane?.appendChild(canvas);
      canvasRef.current = canvas;

      mapRef.current = map;
      map.on("move zoom resize viewreset zoomend moveend", draw);
      map.on("mousemove", handleMove);
      map.on("mouseout", () => onHover(null));
      map.on("click", handleClick);

      setReady(true);
      draw();
    })();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      canvasRef.current = null;
    };
    // Handlers read live values through refs, so this runs exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Nearest cell to a click/hover, within half a cell. */
  function cellAt(latlng: L.LatLng): MapCell | null {
    const { cells: current, cellSizeM: size } = stateRef.current;
    const tolerance = size / 111_320; // degrees; cells are square in lat/lng
    let best: MapCell | null = null;
    let bestD = Infinity;
    for (const c of current) {
      const dLat = Math.abs(c.lat - latlng.lat);
      if (dLat > tolerance) continue;
      const dLng = Math.abs(c.lng - latlng.lng);
      if (dLng > tolerance * 1.05) continue;
      const d = dLat * dLat + dLng * dLng;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  function handleMove(e: L.LeafletMouseEvent) {
    const cell = cellAt(e.latlng);
    onHover(cell ? { cell, x: e.containerPoint.x, y: e.containerPoint.y } : null);
  }

  function handleClick(e: L.LeafletMouseEvent) {
    const cell = cellAt(e.latlng);
    if (cell) onSelect(cell);
  }

  function draw() {
    const map = mapRef.current;
    const canvas = canvasRef.current;
    const leaflet = leafletRef.current;
    if (!map || !canvas || !leaflet) return;

    const size = map.getSize();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (canvas.width !== size.x * dpr || canvas.height !== size.y * dpr) {
      canvas.width = size.x * dpr;
      canvas.height = size.y * dpr;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
    }

    // Pin the canvas to the current top-left of the map pane so it stays put
    // while Leaflet transforms the pane during a pan.
    const topLeft = map.containerPointToLayerPoint([0, 0]);
    leaflet.DomUtil.setPosition(canvas, topLeft);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);

    const { cells: current, thresholds: bands, cellSizeM: metres } = stateRef.current;
    if (current.length === 0) return;

    const palette = ramp(dark);
    const half = metres / 2 / 111_320;
    const bounds = map.getBounds().pad(0.1);

    // Work out the on-screen size of one cell once, from the map scale.
    const probe = current[0];
    const a = map.latLngToContainerPoint([probe.lat - half, probe.lng - half]);
    const b = map.latLngToContainerPoint([probe.lat + half, probe.lng + half]);
    const w = Math.max(2, Math.abs(b.x - a.x));
    const h = Math.max(2, Math.abs(b.y - a.y));

    // Slight transparency keeps the basemap's roads and coastline legible
    // underneath, which is what makes an area recognisable.
    ctx.globalAlpha = 0.72;

    for (const cell of current) {
      if (!bounds.contains([cell.lat, cell.lng])) continue;
      const p = map.latLngToContainerPoint([cell.lat, cell.lng]);
      ctx.fillStyle = palette[bandOf(cell.fit, bands)];
      ctx.fillRect(p.x - w / 2, p.y - h / 2, w + 0.5, h + 0.5);
    }

    ctx.globalAlpha = 1;
  }

  // Redraw whenever the data or the colour scheme changes.
  useEffect(() => {
    if (ready) draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, thresholds, dark, ready]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full rounded-xl"
      style={{ background: "var(--surface-2)" }}
      role="application"
      aria-label="Map of Singapore shaded by how well each area fits your priorities"
    />
  );
}
