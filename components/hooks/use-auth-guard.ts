"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";

interface UseAuthGuardOptions {
  redirectTo?: string;
}

export function useAuthGuard(options: UseAuthGuardOptions = {}) {
  const { redirectTo = "/login" } = options;
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Only redirect after component is mounted on client AND loading is complete
    // This prevents hydration mismatch and ensures localStorage has been read
    if (mounted && !isLoading && !user) {
      router.replace(redirectTo);
    }
  }, [mounted, user, isLoading, router, redirectTo]);

  return { user, isLoading };
}
