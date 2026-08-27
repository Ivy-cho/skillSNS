import type { MetadataRoute } from "next";

// 홈 화면에 추가했을 때(PWA) 안드로이드가 읽는 매니페스트. 아이콘은 public/의 정사각 PNG.
// iOS 홈 화면 아이콘은 app/apple-icon.png(apple-touch-icon)로 따로 처리된다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "토마토",
    short_name: "토마토",
    description: "누구나 자신의 노하우를 스킬로 만들고 공유하는 서비스",
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf7",
    theme_color: "#fafaf7",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
