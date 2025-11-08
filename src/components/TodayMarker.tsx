export function TodayMarker() {
  return (
    <div
      id="timeline-today"
      className="relative flex items-center justify-center my-8 scroll-mt-4"
    >
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t-2 border-black"></div>
      </div>
      <div className="relative bg-white px-4">
        <span className="text-sm font-bold tracking-wider">TODAY</span>
      </div>
    </div>
  );
}
