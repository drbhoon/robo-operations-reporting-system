import { adminPasswordVariableName, adminUsername, isAdminConfigured } from "@/src/lib/auth/admin";

export const metadata = {
  title: "Sign in | Robo Silicon Operations Reporting",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; return_to?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const configured = isAdminConfigured();
  const hasError = params.error === "1";
  const returnTo = safeReturnTo(params.return_to);

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-block">
          <div className="logo-panel">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="Robo Silicon" src="/robo-logo.png" />
          </div>
          <div>
            <p className="eyebrow">Robo Silicon operations</p>
            <h1>Sign in</h1>
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
          <input name="return_to" type="hidden" value={returnTo} />
          <label className="field">
            <span>Username or email</span>
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

function safeReturnTo(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/operations";
  return value;
}
