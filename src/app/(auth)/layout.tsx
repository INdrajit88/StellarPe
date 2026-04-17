/**
 * Auth route group layout.
 * Centers the auth form card on screen with a mobile-first responsive design.
 * This layout wraps /login and /register pages.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
