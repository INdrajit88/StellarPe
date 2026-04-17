/**
 * User section layout.
 * Provides a consistent container for all /user/* pages.
 * The BottomNav is handled by the parent (dashboard) layout.
 */
export default function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
