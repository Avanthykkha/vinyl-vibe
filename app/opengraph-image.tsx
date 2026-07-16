import { ImageResponse } from "next/og";

export const alt = "Vinyl — discover, play and listen together";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background:
          "radial-gradient(circle at 20% 20%, #8b4c5d 0%, #302c34 46%, #17171c 100%)",
        color: "#fff8f1",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          background:
            "repeating-radial-gradient(circle, #121318 0px, #121318 8px, #343640 9px, #17181e 13px)",
          border: "8px solid rgba(255,248,241,.9)",
          borderRadius: "999px",
          boxShadow: "0 35px 90px rgba(0,0,0,.55)",
          display: "flex",
          height: "520px",
          left: "-120px",
          position: "absolute",
          top: "55px",
          width: "520px",
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginLeft: "330px",
          width: "700px",
        }}
      >
        <div
          style={{
            color: "#d98b9a",
            fontSize: "24px",
            fontWeight: 700,
            letterSpacing: "8px",
            textTransform: "uppercase",
          }}
        >
          Put your records on
        </div>
        <div style={{ fontSize: "112px", fontWeight: 700, marginTop: "12px" }}>
          Vinyl
        </div>
        <div style={{ color: "#d7d0cb", fontSize: "31px", marginTop: "18px" }}>
          Discover music. Build playlists. Listen together.
        </div>
      </div>
    </div>,
    size
  );
}
