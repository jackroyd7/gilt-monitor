import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in · Markets Monitor" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="card p-6">
        <h1 className="text-lg font-semibold text-ink">Markets Monitor</h1>
        <p className="mt-1 mb-4 text-sm text-ink-2">Sign in with the site password. You’ll stay signed in on this device.</p>
        <LoginForm next={typeof next === "string" ? next : "/"} />
      </div>
    </div>
  );
}
