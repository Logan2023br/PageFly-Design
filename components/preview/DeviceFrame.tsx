"use client";

import type { ReactNode } from "react";
import type { DeviceId } from "@/lib/generate/types";

/* ==========================================================================
   Realistic device chrome.

   Desktop and laptop get a browser bar with traffic-light dots and a URL field.
   Tablet and mobile get a rounded bezel with a notch. The chrome is drawn
   around the frame, never over the page, so nothing obscures the mockup.
   ========================================================================== */

export function DeviceFrame({
  device,
  width,
  height,
  brandLabel,
  children,
}: {
  device: DeviceId;
  width: number;
  height: number;
  brandLabel: string;
  children: ReactNode;
}) {
  const isHandheld = device === "mobile" || device === "tablet";
  const bezel = isHandheld ? (device === "mobile" ? 11 : 14) : 0;
  const barHeight = isHandheld ? 0 : 38;
  const outerRadius = isHandheld ? (device === "mobile" ? 42 : 30) : 12;

  return (
    <div
      style={{
        width: width + bezel * 2,
        background: isHandheld ? "#1b1b21" : "#23222b",
        borderRadius: outerRadius,
        padding: bezel,
        boxShadow:
          "0 48px 120px -40px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.07)",
      }}
    >
      {/* Browser bar (desktop / laptop) */}
      {!isHandheld && (
        <div
          style={{
            height: barHeight,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 14px",
            borderTopLeftRadius: outerRadius - 2,
            borderTopRightRadius: outerRadius - 2,
            background: "#2c2b35",
          }}
        >
          <div style={{ display: "flex", gap: 6 }}>
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <span
                key={c}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: c,
                }}
              />
            ))}
          </div>
          <div
            style={{
              flex: 1,
              height: 22,
              borderRadius: 999,
              background: "rgba(0,0,0,.28)",
              display: "flex",
              alignItems: "center",
              paddingLeft: 12,
              fontSize: 11,
              fontFamily: "ui-monospace, monospace",
              color: "rgba(255,255,255,.42)",
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
          >
            {brandLabel}
          </div>
          <div style={{ width: 44 }} />
        </div>
      )}

      {/* Notch (mobile / tablet) */}
      {isHandheld && (
        <div
          style={{
            height: device === "mobile" ? 22 : 16,
            display: "grid",
            placeItems: "center",
          }}
        >
          <span
            style={{
              width: device === "mobile" ? 88 : 62,
              height: device === "mobile" ? 6 : 5,
              borderRadius: 999,
              background: "rgba(255,255,255,.22)",
            }}
          />
        </div>
      )}

      <div
        style={{
          width,
          height,
          overflow: "hidden",
          borderRadius: isHandheld ? outerRadius - bezel + 2 : 0,
          borderBottomLeftRadius: isHandheld ? outerRadius - bezel + 2 : outerRadius - 2,
          borderBottomRightRadius: isHandheld ? outerRadius - bezel + 2 : outerRadius - 2,
          position: "relative",
        }}
      >
        {children}
      </div>

      {/* Home indicator (mobile) */}
      {device === "mobile" && (
        <div style={{ height: 14, display: "grid", placeItems: "center" }}>
          <span
            style={{
              width: 104,
              height: 4,
              borderRadius: 999,
              background: "rgba(255,255,255,.3)",
            }}
          />
        </div>
      )}
    </div>
  );
}
