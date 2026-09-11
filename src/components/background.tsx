interface BackgroundProps {
  imageUrl: string;
  opacity: number;
}

function Background({ imageUrl, opacity }: BackgroundProps) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: -1,
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        opacity: opacity,
      }}
    />
  );
}

export default Background;
