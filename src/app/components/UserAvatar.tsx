import { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../config/api";
import type { CurrentUser } from "../config/auth";

type AvatarUser = Pick<
  CurrentUser,
  "id" | "nombre" | "apellido" | "correo" | "foto_url"
>;

interface UserAvatarProps {
  user: AvatarUser | null;
  className?: string;
}

function getInitials(user: AvatarUser | null) {
  const nameParts = [user?.nombre, user?.apellido]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  if (nameParts.length > 0) {
    return nameParts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("");
  }
  return user?.correo?.trim()?.[0]?.toUpperCase() || "--";
}

export function UserAvatar({ user, className = "" }: UserAvatarProps) {
  const [imageSource, setImageSource] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setImageSource(null);
    setImageLoaded(false);
    const remotePhoto = user?.foto_url?.trim();
    if (!remotePhoto) return;

    const controller = new AbortController();
    let disposed = false;
    let objectUrl: string | null = null;

    void (async () => {
      try {
        const response = await apiFetch(`${API_BASE}/auth/avatar`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("No fue posible obtener el avatar");
        const image = await response.blob();
        if (!image.type.startsWith("image/") || image.size === 0) {
          throw new Error("La respuesta no contiene una imagen");
        }
        const nextObjectUrl = URL.createObjectURL(image);
        if (disposed) {
          URL.revokeObjectURL(nextObjectUrl);
          return;
        }
        objectUrl = nextObjectUrl;
        setImageSource(nextObjectUrl);
      } catch {
        if (!controller.signal.aborted && !disposed) {
          // Si el proxy no está disponible durante una actualización gradual,
          // se conserva compatibilidad intentando la URL pública de Google.
          setImageSource(remotePhoto);
        }
      }
    })();

    return () => {
      disposed = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [user?.id, user?.foto_url]);

  const displayName = [user?.nombre, user?.apellido].filter(Boolean).join(" ");

  return (
    <div
      className={`relative overflow-hidden rounded-full bg-[#1e3a8a] text-white ${className}`}
      aria-label={`Foto de perfil de ${displayName || "usuario"}`}
    >
      <span className="absolute inset-0 flex items-center justify-center">
        {getInitials(user)}
      </span>
      {imageSource && (
        <img
          src={imageSource}
          alt=""
          referrerPolicy="no-referrer"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
            imageLoaded ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setImageLoaded(true)}
          onError={() => {
            setImageLoaded(false);
            setImageSource(null);
          }}
        />
      )}
    </div>
  );
}
