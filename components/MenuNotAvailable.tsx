export default function MenuNotAvailable() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 text-center">
      <div className="text-4xl mb-4">🍽️</div>
      <h1 className="text-xl font-semibold text-gray-900 mb-2">Menu not yet available</h1>
      <p className="text-sm text-gray-500 max-w-xs">
        This venue&apos;s menu hasn&apos;t been set up yet. Please check back soon.
      </p>
    </div>
  );
}
