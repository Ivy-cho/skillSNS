"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { BackButton } from "@/components/nav/BackButton";
import {
  getAccessToken,
  getStoredUser,
  updateProfile,
  updateStoredUser,
  uploadAvatar,
} from "@/lib/authClient";

const NICKNAME_MAX = 20;
const BIO_MAX = 80;

// user-service에 PATCH /auth/me 와 bio/avatar_url 컬럼이 생기면 true로 바꾼다.
// 그전까지는 저장이 실패할 게 뻔하므로 호출하지 않고 안내만 띄운다. (BACKEND_HANDOFF.md)
const PROFILE_SAVE_ENABLED = false;

export default function ProfileEditPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  // 새로 고른 사진: 서버에 올리기 전까지는 화면에만 미리보기로 보여준다.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 저장된 세션 값으로 폼 초기화. localStorage는 서버 렌더에선 읽을 수 없어서, 렌더 중
  // 초기화(lazy useState)로 하면 hydration 불일치가 난다. 그래서 마운트 후 한 번만 채운다.
  useEffect(() => {
    const user = getStoredUser();
    if (!user) return;
    /* eslint-disable react-hooks/set-state-in-effect -- 외부 저장소(localStorage) → 폼 초기값 1회 동기화 */
    setNickname(user.nickname ?? "");
    setBio(user.bio ?? "");
    setAvatarUrl(user.avatar_url ?? null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // 새로 고른 사진의 미리보기 URL은 파일에서 바로 파생되는 값이라 렌더 중 계산하고,
  // 이펙트는 정리(revoke)만 맡는다.
  const previewUrl = useMemo(
    () => (pickedFile ? URL.createObjectURL(pickedFile) : null),
    [pickedFile]
  );
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // 화면에 보일 사진: 새로 고른 게 있으면 그것, 없으면 기존 프로필 사진.
  const shownAvatar = previewUrl ?? avatarUrl;

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPickedFile(file);
  }

  async function handleSave() {
    setError(null);

    if (!PROFILE_SAVE_ENABLED) {
      setNotice("프로필 저장은 백엔드 준비 중이에요. 화면과 입력은 미리 만들어 뒀어요.");
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setError("로그인이 필요해요");
      return;
    }

    setSaving(true);
    try {
      let uploadedUrl: string | undefined;
      if (pickedFile) uploadedUrl = await uploadAvatar(token, pickedFile);

      const updated = await updateProfile(token, {
        nickname: nickname.trim(),
        bio: bio.trim(),
        ...(uploadedUrl ? { avatar_url: uploadedUrl } : {}),
      });
      updateStoredUser(updated);
      router.replace("/home");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요");
    } finally {
      setSaving(false);
    }
  }

  const nicknameTooLong = nickname.length > NICKNAME_MAX;
  const bioTooLong = bio.length > BIO_MAX;
  const canSave = nickname.trim().length > 0 && !nicknameTooLong && !bioTooLong && !saving;

  return (
    <AuthGate>
    <main className="flex min-h-0 flex-1 flex-col sm:items-center sm:justify-center sm:p-6">
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface sm:h-[720px] sm:max-w-[390px] sm:rounded-[20px] sm:border sm:border-border sm:shadow-md">
        {/* 상단 바 */}
        <header className="flex items-center justify-between border-b border-border px-3 py-3">
          <BackButton fallback="/home" />
          <span className="text-[0.9rem] font-bold text-ink">프로필 편집</span>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            aria-label="저장"
            className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-primary transition hover:bg-surface-2 active:scale-95 disabled:opacity-40 motion-reduce:transition-none"
          >
            {saving ? (
              <span
                className="inline-block h-2 w-2 rounded-full bg-primary"
                style={{ animation: "dot-ring 1.2s ease-out infinite" }}
              />
            ) : (
              "✓"
            )}
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-bg p-5">
          {/* 사진 */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative transition active:scale-95 motion-reduce:transition-none"
              aria-label="프로필 사진 바꾸기"
            >
              <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary-tint text-3xl">
                {shownAvatar ? (
                  // 미리보기/기존 사진. next/image는 외부 도메인 설정이 필요해 여기선 img를 쓴다.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shownAvatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  "🙂"
                )}
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-[0.7rem]">
                📷
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handlePick}
              className="hidden"
            />
            <p className="mt-2 text-[0.75rem] text-muted">사진을 눌러 바꿔요</p>
          </div>

          {/* 닉네임 */}
          <div className="mt-6">
            <div className="flex items-baseline justify-between">
              <label htmlFor="nickname" className="text-[0.8rem] font-semibold text-ink">
                닉네임
              </label>
              <span
                className={`font-mono text-[0.68rem] ${
                  nicknameTooLong ? "text-error" : "text-muted"
                }`}
              >
                {nickname.length}/{NICKNAME_MAX}
              </span>
            </div>
            <input
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="어떻게 불러드릴까요?"
              className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base text-ink focus:border-primary focus:outline-none sm:text-[0.85rem]"
            />
          </div>

          {/* 소개글 */}
          <div className="mt-4">
            <div className="flex items-baseline justify-between">
              <label htmlFor="bio" className="text-[0.8rem] font-semibold text-ink">
                소개글
              </label>
              <span
                className={`font-mono text-[0.68rem] ${bioTooLong ? "text-error" : "text-muted"}`}
              >
                {bio.length}/{BIO_MAX}
              </span>
            </div>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="어떤 노하우를 나누는지 한두 줄로 적어주세요"
              className="mt-1.5 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-base leading-relaxed text-ink focus:border-primary focus:outline-none sm:text-[0.85rem]"
            />
          </div>

          {notice && (
            <div className="mt-4 rounded-xl bg-info-tint px-4 py-3 text-[0.8rem] leading-relaxed text-info">
              {notice}
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-xl bg-error/10 px-4 py-3 text-[0.8rem] leading-relaxed text-error">
              ⚠️ {error}
            </div>
          )}
        </div>
      </div>
    </main>
    </AuthGate>
  );
}
