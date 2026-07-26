import Image from "next/image";
import { adminPasswordVariableName, adminUsername, isAdminConfigured } from "@/src/lib/auth/admin";

export const metadata = {
  title: "Sign in | Robo Silicon Operations Reporting",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const configured = isAdminConfigured();
  const hasError = params.error === "1";

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-block">
          <div className="logo-panel">
            <Image alt="Robo Silicon" height={52} priority src="/robo-logo.png" width={92} />
          </div>
          <div>
            <p className="eyebrow">Robo Silicon operations</p>
            <h1>Admin sign in</h1>
          </div>
        </div>

        {!configured ? (
          <div className="alert-card">
            Railway variable <strong>{adminPasswordVariableName()}</strong> is not configured. Add it in Railway
            variables, then redeploy or restart the service.
          </div>
        ) : null}

        {hasError ? <div className="alert-card">Invalid admin username or password.</div> : null}

        <form action="/api/auth/login" className="login-form" method="post">
          <label className="field">
            <span>Username</span>
            <input autoComplete="username" defaultValue={adminUsername()} name="username" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input autoComplete="current-password" name="password" required type="password" />
          </label>
          <button className="btn primary" disabled={!configured} type="submit">
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
