export default function AccessDenied() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
      <div className="text-4xl mb-4">🚫</div>
      <h1 className="text-xl font-semibold text-gray-900 mb-2">Access denied</h1>
      <p className="text-sm text-gray-500 max-w-xs">
        You don&apos;t have permission to view this page. Please sign in with an authorized account.
      </p>
    </div>
  );
}
