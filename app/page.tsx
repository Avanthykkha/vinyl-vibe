"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import VinylLogo from "./components/VinylLogo";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type StoredAccount = {
  username: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
};

const ARTIST_CHOICES = [
  "BTS",
  "Kendrick Lamar",
  "Tyler, The Creator",
  "SZA",
  "Taylor Swift",
  "Gracie Abrams",
  "The Weeknd",
  "Billie Eilish",
  "Frank Ocean",
  "Ariana Grande",
  "Sabrina Carpenter",
  "Bruno Mars",
  "Doja Cat",
  "Lana Del Rey",
  "Sai Abhyankkar",
  "A.R. Rahman",
];

const FRESH_PROFILE_KEYS = [
  "vinyl-history",
  "vinyl-liked",
  "vinyl-playlists",
  "vinyl-artists",
  "vinyl-preferred-artists",
  "vinyl-hidden-home-songs",
  "vinyl-not-interested-signals",
  "vinyl-queue",
  "vinyl-profile-avatar",
  "vinyl-user-id",
  "vinyl-username",
];

function makeUniqueUsername(name: string, id: string) {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "listener";
  return `${base}-${id.slice(-4).toLowerCase()}`;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string) {
  return new Uint8Array(
    hex.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) || []
  );
}

async function hashPassword(password: string, salt?: string) {
  const passwordSalt =
    salt || bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: hexToBytes(passwordSalt),
      iterations: 120_000,
    },
    key,
    256
  );

  return {
    passwordHash: bytesToHex(new Uint8Array(bits)),
    passwordSalt,
  };
}

export default function LoginPage() {
  const router = useRouter();
  const backendReady = isSupabaseConfigured();
  const [mode, setMode] = useState<"signin" | "signup" | "preferences">(
    "signin"
  );
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const [accentTheme, setAccentTheme] = useState<"rose" | "sunset">("rose");
  const [selectedArtists, setSelectedArtists] = useState<string[]>([]);
  const [customArtist, setCustomArtist] = useState("");
  const [artistImages, setArtistImages] = useState<
    Record<string, { image: string; channelTitle: string } | null>
  >({});
  const [loadingArtistImages, setLoadingArtistImages] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      if (localStorage.getItem("vinyl-accent-theme") === "sunset") {
        setAccentTheme("sunset");
      }
    });
  }, []);

  useEffect(() => {
    if (!backendReady) return;

    const supabase = createSupabaseClient();
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/home");
    });
  }, [backendReady, router]);

  useEffect(() => {
    if (mode !== "preferences") return;

    const controller = new AbortController();
    const params = new URLSearchParams();
    ARTIST_CHOICES.forEach((artist) => params.append("name", artist));

    queueMicrotask(() => {
      if (controller.signal.aborted) return;

      setLoadingArtistImages(true);
      fetch(`/api/artists?${params.toString()}`, {
        signal: controller.signal,
      })
        .then((response) => response.json())
        .then((data) => setArtistImages(data.artists || {}))
        .catch(() => undefined)
        .finally(() => setLoadingArtistImages(false));
    });

    return () => controller.abort();
  }, [mode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSigningIn(true);
    setError("");

    try {
      if (backendReady) {
        const supabase = createSupabaseClient();
        const cleanEmail = email.trim().toLowerCase();

        if (!cleanEmail.includes("@")) {
          throw new Error("Use your account email to sign in.");
        }

        if (mode === "signup") {
          const cleanUsername = username
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, "-")
            .replace(/^-+|-+$/g, "");

          if (cleanUsername.length < 3) {
            throw new Error("Username must be at least 3 characters.");
          }
          if (cleanUsername.length > 30) {
            throw new Error("Username must be 30 characters or fewer.");
          }
          if (password.length < 8) {
            throw new Error("Password must be at least 8 characters.");
          }

          const { data: existingProfile } = await supabase
            .from("profiles")
            .select("id")
            .ilike("username", cleanUsername)
            .maybeSingle();

          if (existingProfile) {
            throw new Error("That username is already taken.");
          }

          const { data, error: signUpError } = await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: {
              data: {
                username: cleanUsername,
                display_name: username.trim(),
              },
              emailRedirectTo: `${window.location.origin}/auth/confirm`,
            },
          });

          if (signUpError) throw signUpError;

          FRESH_PROFILE_KEYS.forEach((key) => localStorage.removeItem(key));
          localStorage.setItem("vinyl-profile-name", username.trim());
          localStorage.setItem("vinyl-profile-email", cleanEmail);
          localStorage.setItem("vinyl-username", cleanUsername);
          if (data.user) {
            localStorage.setItem("vinyl-user-id", data.user.id);
          }

          if (!data.session) {
            setError(
              "Account created! Check your email, confirm your account, then sign in to finish choosing your artists."
            );
            setSigningIn(false);
            return;
          }

          setMode("preferences");
          setSigningIn(false);
          return;
        }

        const { data, error: signInError } =
          await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });

        if (signInError) throw signInError;

        const [{ data: profile }, { data: preferences }] = await Promise.all([
          supabase
            .from("profiles")
            .select("username, display_name, avatar_url, accent_theme, dark_mode")
            .eq("id", data.user.id)
            .single(),
          supabase
            .from("artist_preferences")
            .select("artist_name")
            .eq("user_id", data.user.id),
        ]);

        localStorage.setItem("vinyl-user-id", data.user.id);
        localStorage.setItem("vinyl-profile-email", data.user.email ?? cleanEmail);
        if (profile) {
          localStorage.setItem("vinyl-username", profile.username);
          localStorage.setItem("vinyl-profile-name", profile.display_name);
          localStorage.setItem("vinyl-accent-theme", profile.accent_theme);
          localStorage.setItem("vinyl-dark-mode", String(profile.dark_mode));
          if (profile.avatar_url) {
            localStorage.setItem("vinyl-profile-avatar", profile.avatar_url);
          }
        }

        if (!preferences?.length) {
          setMode("preferences");
          setSigningIn(false);
          return;
        }

        localStorage.setItem(
          "vinyl-preferred-artists",
          JSON.stringify(preferences.map((item) => item.artist_name))
        );
        router.replace("/home");
        return;
      }

      if (mode === "signup") {
        if (username.trim().length < 3) {
          throw new Error("Username must be at least 3 characters.");
        }
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }

        const credentials = await hashPassword(password);
        const vinylId = `VINYL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        const uniqueUsername = makeUniqueUsername(username, vinylId);
        const account: StoredAccount = {
          username: uniqueUsername,
          email: email.trim().toLowerCase(),
          ...credentials,
        };
        FRESH_PROFILE_KEYS.forEach((key) => localStorage.removeItem(key));
        localStorage.setItem("vinyl-account", JSON.stringify(account));
        localStorage.setItem("vinyl-profile-name", username.trim());
        localStorage.setItem("vinyl-profile-email", account.email);
        localStorage.setItem("vinyl-user-id", vinylId);
        localStorage.setItem("vinyl-username", uniqueUsername);
      } else {
        const saved = localStorage.getItem("vinyl-account");
        if (!saved) {
          throw new Error("No Vinyl account found. Create one first.");
        }

        const account = JSON.parse(saved) as StoredAccount;
        const credentials = await hashPassword(
          password,
          account.passwordSalt
        );
        const loginId = email.trim().toLowerCase();
        const identityMatches =
          account.email.toLowerCase() === loginId ||
          account.username.toLowerCase() === loginId;

        if (
          !identityMatches ||
          account.passwordHash !== credentials.passwordHash
        ) {
          throw new Error("That username/email or password is incorrect.");
        }
      }

      const account = JSON.parse(
        localStorage.getItem("vinyl-account") || "{}"
      ) as StoredAccount;
      const session = JSON.stringify({
        username: account.username,
        signedInAt: Date.now(),
      });

      localStorage.removeItem("vinyl-session");
      sessionStorage.removeItem("vinyl-session");
      (rememberMe ? localStorage : sessionStorage).setItem(
        "vinyl-session",
        session
      );

      if (mode === "signup") {
        setMode("preferences");
        setSigningIn(false);
        return;
      }

      window.setTimeout(() => router.replace("/home"), 350);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not sign in. Please try again."
      );
      setSigningIn(false);
    }
  }

  function toggleArtistPreference(artist: string) {
    setSelectedArtists((previous) =>
      previous.includes(artist)
        ? previous.filter((item) => item !== artist)
        : [...previous, artist]
    );
  }

  function addCustomArtist() {
    const artist = customArtist.trim();
    if (!artist) return;

    setSelectedArtists((previous) =>
      previous.some(
        (item) => item.toLowerCase() === artist.toLowerCase()
      )
        ? previous
        : [...previous, artist]
    );
    setCustomArtist("");
  }

  async function finishOnboarding() {
    if (selectedArtists.length < 3) {
      setError("Pick at least 3 artists so Vinyl can learn your sound.");
      return;
    }

    try {
      setSigningIn(true);
      setError("");

      if (backendReady) {
        const supabase = createSupabaseClient();
        const { data, error: userError } = await supabase.auth.getUser();
        if (userError || !data.user) {
          throw new Error("Confirm your email and sign in before saving your artists.");
        }

        const { error: deleteError } = await supabase
          .from("artist_preferences")
          .delete()
          .eq("user_id", data.user.id);
        if (deleteError) throw deleteError;

        const { error: insertError } = await supabase
          .from("artist_preferences")
          .insert(
            selectedArtists.map((artist) => ({
              user_id: data.user.id,
              artist_name: artist,
            }))
          );
        if (insertError) throw insertError;

        const { error: profileError } = await supabase
          .from("profiles")
          .update({ onboarding_complete: true })
          .eq("id", data.user.id);
        if (profileError) throw profileError;
      }

      localStorage.setItem(
        "vinyl-preferred-artists",
        JSON.stringify(selectedArtists)
      );
      router.replace("/home");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not save your artists."
      );
      setSigningIn(false);
    }
  }

  return (
    <main className={`login-shell theme-${accentTheme} relative h-screen overflow-x-hidden overflow-y-auto bg-[#17151b] text-[#fff9f1]`}>
      <div className="login-theme-wash pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(255,120,174,0.2),transparent_34%),radial-gradient(circle_at_82%_75%,rgba(244,180,155,0.16),transparent_30%),linear-gradient(135deg,#17151b_0%,#25212a_48%,#151419_100%)]" />
      <div className="login-noise pointer-events-none absolute inset-0 opacity-30" />
      <div className="pointer-events-none absolute -left-36 -top-40 h-[520px] w-[520px] rounded-full border border-white/10" />
      <div className="pointer-events-none absolute -bottom-52 -right-40 h-[620px] w-[620px] rounded-full border border-pink-300/15" />

      <div className="relative z-10 mx-auto grid min-h-screen max-w-[1500px] grid-cols-1 items-center gap-10 px-6 py-8 lg:grid-cols-[1.08fr_0.92fr] lg:px-14">
        <section className="relative hidden min-h-[680px] items-center justify-center lg:flex">
          <div className="absolute left-0 top-4">
            <p className="text-xs font-bold uppercase tracking-[0.45em] text-pink-300">
              Your music. Your orbit.
            </p>
            <VinylLogo className="mt-1 h-24 w-48 text-white" />
          </div>

          <div className="login-orbit relative mt-14 h-[560px] w-[560px]">
            <div className="absolute inset-0 rounded-full border border-white/15" />
            <div className="absolute inset-7 rounded-full border border-pink-200/25" />
            <div className="login-orbit-dot absolute left-1/2 top-[-9px] -ml-2.5 h-5 w-5 rounded-full border-4 border-[#302934] bg-pink-300 shadow-[0_0_28px_rgba(249,132,185,0.9)]" />

            <div className="login-record absolute inset-14 rounded-full shadow-[0_35px_90px_rgba(0,0,0,0.6)]">
              <div className="login-record-shine absolute inset-0 rounded-full" />
              <div className="login-record-label absolute left-1/2 top-1/2 flex h-44 w-44 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[radial-gradient(circle,#ffbad8_0%,#f27eae_50%,#8c355d_100%)] shadow-[0_0_0_10px_#08080a,0_0_35px_rgba(244,114,182,0.35)]">
                <div className="text-center text-[#291c27]">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.34em]">
                    Side A
                  </span>
                  <span className="mt-1 block text-2xl font-black tracking-[0.08em]">
                    VV
                  </span>
                  <span className="mt-1 block text-[9px] uppercase tracking-[0.2em]">
                    Play your world
                  </span>
                </div>
              </div>
              <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#111] shadow-inner" />
            </div>

            <div className="absolute bottom-8 left-0 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur-xl">
              <p className="text-xs uppercase tracking-[0.25em] text-pink-200">
                Now spinning
              </p>
              <p className="mt-1 text-sm text-white/75">
                A home for every song you love
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[490px]">
          <div className="mb-8 lg:hidden">
            <p className="text-xs font-bold uppercase tracking-[0.4em] text-pink-300">
              Your music. Your orbit.
            </p>
            <VinylLogo className="mt-1 h-20 w-40 text-white" />
          </div>

          <div className="rounded-[38px] border border-white/10 bg-white/[0.075] p-7 shadow-[0_35px_100px_rgba(0,0,0,0.38)] backdrop-blur-2xl sm:p-10">
            <div className="mb-8 flex items-start justify-between gap-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.34em] text-pink-300">
                  {mode === "signin"
                    ? "Welcome back"
                    : mode === "signup"
                      ? "Join the groove"
                      : "Shape your sound"}
                </p>
                <h2 className="mt-3 text-4xl font-light">
                  {mode === "signin"
                    ? "Drop the needle."
                    : mode === "signup"
                      ? "Create your side A."
                      : "Who do you play?"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/55">
                  {mode === "signin"
                    ? "Sign in and pick up exactly where your last song left off."
                    : mode === "signup"
                      ? "Choose your identity and start building your personal collection."
                      : "Choose at least three artists. Vinyl will build a fresh home around your taste."}
                </p>
              </div>
              <div className="login-mini-record mt-1 h-14 w-14 shrink-0 rounded-full shadow-lg">
                <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink-300" />
              </div>
            </div>

            {mode === "preferences" ? (
              <div>
                <div className="max-h-[330px] overflow-y-auto pr-2">
                  {loadingArtistImages && (
                    <p className="mb-3 text-xs text-white/40">
                      Loading official artist photos…
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {ARTIST_CHOICES.map((artist) => {
                      const selected = selectedArtists.includes(artist);

                      return (
                        <button
                          type="button"
                          key={artist}
                          onClick={() => toggleArtistPreference(artist)}
                          className={`group flex flex-col items-center rounded-3xl border px-2 py-3 text-center text-xs font-semibold ${
                            selected
                              ? "border-pink-300 bg-white/12 text-white shadow-[0_0_0_3px_rgba(211,140,157,0.18)]"
                              : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                          }`}
                        >
                          <span
                            className={`relative mb-2 flex h-[88px] w-[88px] items-center justify-center rounded-full bg-white/10 bg-cover bg-center text-2xl shadow-xl transition group-hover:scale-105 ${
                              selected
                                ? "ring-4 ring-pink-300 ring-offset-4 ring-offset-[#332b2d]"
                                : "ring-1 ring-white/10"
                            }`}
                            style={
                              artistImages[artist]?.image
                                ? {
                                    backgroundImage: `url("${artistImages[artist]?.image}")`,
                                  }
                                : undefined
                            }
                          >
                            {!artistImages[artist]?.image && artist.charAt(0)}
                            {selected && (
                              <span className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-pink-300 text-sm text-[#281923] shadow-lg">
                                ✓
                              </span>
                            )}
                          </span>
                          <span className="line-clamp-2 min-h-8">{artist}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <input
                    value={customArtist}
                    onChange={(event) => setCustomArtist(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") addCustomArtist();
                    }}
                    placeholder="Add another artist..."
                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-pink-300/70"
                  />
                  <button
                    type="button"
                    onClick={addCustomArtist}
                    className="rounded-2xl bg-white/10 px-4 text-sm hover:bg-white/15"
                  >
                    Add
                  </button>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-white/45">
                  <span>{selectedArtists.length} selected</span>
                  <span>Minimum 3</span>
                </div>

                {error && (
                  <p className="mt-4 rounded-2xl border border-red-300/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={finishOnboarding}
                  disabled={signingIn}
                  className="login-primary-button mt-5 w-full rounded-2xl bg-gradient-to-r from-[#d987a7] via-[#eab0c3] to-[#dc968d] py-4 font-bold text-[#281923] shadow-xl"
                >
                  {signingIn ? "Saving your sound…" : "Build my Vinyl home →"}
                </button>
              </div>
            ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {mode === "signup" && (
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/55">
                    Username
                  </span>
                  <div className="flex items-center rounded-2xl border border-white/10 bg-black/20 px-4 transition focus-within:border-pink-300/70 focus-within:bg-black/30">
                    <span className="mr-3 text-pink-300">✦</span>
                    <input
                      required
                      minLength={3}
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="Choose your Vinyl name"
                      autoComplete="username"
                      className="min-w-0 flex-1 bg-transparent py-4 text-sm text-white outline-none placeholder:text-white/25"
                    />
                  </div>
                </label>
              )}

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/55">
                  {mode === "signin"
                    ? backendReady
                      ? "Email"
                      : "Email or username"
                    : "Email"}
                </span>
                <div className="flex items-center rounded-2xl border border-white/10 bg-black/20 px-4 transition focus-within:border-pink-300/70 focus-within:bg-black/30 focus-within:shadow-[0_0_0_4px_rgba(244,114,182,0.08)]">
                  <span className="mr-3 text-pink-300">●</span>
                  <input
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={
                      mode === "signin"
                        ? backendReady
                          ? "Your account email"
                          : "Email or Vinyl username"
                        : "listener@vinyl.app"
                    }
                    type={backendReady || mode === "signup" ? "email" : "text"}
                    autoComplete="username"
                    className="min-w-0 flex-1 bg-transparent py-4 text-sm text-white outline-none placeholder:text-white/25"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/55">
                  Password
                </span>
                <div className="flex items-center rounded-2xl border border-white/10 bg-black/20 px-4 transition focus-within:border-pink-300/70 focus-within:bg-black/30 focus-within:shadow-[0_0_0_4px_rgba(244,114,182,0.08)]">
                  <span className="mr-3 text-pink-300">◆</span>
                  <input
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type={showPassword ? "text" : "password"}
                    placeholder="Your secret track"
                    autoComplete="current-password"
                    className="min-w-0 flex-1 bg-transparent py-4 text-sm text-white outline-none placeholder:text-white/25"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((previous) => !previous)}
                    className="rounded-full px-2 py-1 text-xs font-semibold text-white/45 hover:bg-white/10 hover:text-pink-200"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              <div className="flex items-center justify-between gap-4 text-sm">
                <label className="flex cursor-pointer items-center gap-2 text-white/55">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                    className="h-4 w-4 accent-pink-400"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setError(
                      "Password recovery needs a verified email service when Vinyl is deployed."
                    )
                  }
                  className="text-pink-300 hover:text-pink-200"
                >
                  Forgot password?
                </button>
              </div>

              {error && (
                <p className="rounded-2xl border border-red-300/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={signingIn}
                className="login-primary-button group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-[#f37db2] via-[#f59bc1] to-[#ef9b95] py-4 font-bold text-[#281923] shadow-[0_16px_40px_rgba(244,114,182,0.28)] hover:shadow-[0_18px_50px_rgba(244,114,182,0.42)] disabled:opacity-70"
              >
                <span className="relative z-10">
                  {signingIn
                    ? "Warming up the record…"
                    : mode === "signin"
                      ? "Enter Vinyl  →"
                      : "Create my Vinyl account  →"}
                </span>
              </button>
            </form>
            )}

            {mode !== "preferences" && (
              <>
            <div className="my-7 flex items-center gap-3 text-[10px] uppercase tracking-[0.25em] text-white/25">
              <span className="h-px flex-1 bg-white/10" />
              New listener?
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <button
              type="button"
              onClick={() => {
                setMode((previous) =>
                  previous === "signin" ? "signup" : "signin"
                );
                setError("");
                setPassword("");
              }}
              className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 text-sm font-semibold text-white/75 hover:border-pink-300/30 hover:bg-white/10 hover:text-white"
            >
              {mode === "signin"
                ? "Create your Vinyl account"
                : "I already have an account"}
            </button>
              </>
            )}

            <p className="mt-6 text-center text-[11px] leading-5 text-white/30">
              Your likes, playlists, queue and listening history stay in your private groove.
            </p>
          </div>

          <div className="mt-5 flex flex-wrap justify-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/35">
            <span className="rounded-full border border-white/10 px-3 py-1.5">Smart mixes</span>
            <span className="rounded-full border border-white/10 px-3 py-1.5">Custom vinyl</span>
            <span className="rounded-full border border-white/10 px-3 py-1.5">Your queue</span>
          </div>
        </section>
      </div>
    </main>
  );
}
