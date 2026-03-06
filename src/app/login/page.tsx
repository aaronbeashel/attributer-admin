"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Mail01, Lock01 } from "@untitledui/icons";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "unauthorized"
      ? "Your email is not authorized to access the admin panel."
      : null
  );
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-secondary bg-primary p-6 shadow-xs">
      <div className="mb-6 text-center">
        <h1 className="text-display-xs font-semibold text-primary">
          Attributer Admin
        </h1>
        <p className="mt-1 text-sm text-tertiary">
          Sign in to access the admin dashboard
        </p>
      </div>

      <form onSubmit={handleLogin} className="flex flex-col gap-4">
        {error && (
          <div className="rounded-lg border border-error-secondary bg-error-secondary p-3 text-sm text-error-primary">
            {error}
          </div>
        )}

        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          icon={Mail01}
          value={email}
          onChange={setEmail}
          isRequired
        />

        <Input
          label="Password"
          type="password"
          placeholder="Enter your password"
          icon={Lock01}
          value={password}
          onChange={setPassword}
          isRequired
        />

        <Button
          type="submit"
          color="primary"
          size="lg"
          className="mt-2 w-full"
          isDisabled={loading}
        >
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary p-4">
      <div className="w-full max-w-sm">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
