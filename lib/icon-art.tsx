// The app icon, drawn with ImageResponse so no image files need to be kept in the repo.
export function IconArt({ size }: { size: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #184f95 0%, #0d366b 100%)",
        color: "#ffffff",
        fontSize: Math.round(size * 0.58),
        fontWeight: 700,
        fontFamily: "sans-serif",
      }}
    >
      £
    </div>
  );
}
