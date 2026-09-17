/**
 * Runs `fn` over `items` with at most `limit` in flight, preserving result
 * order. Rejections propagate after in-flight work settles so callers see one
 * error, not a torn batch.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let failure: unknown = null;
  const worker = async (): Promise<void> => {
    while (next < items.length && failure === null) {
      const index = next++;
      try {
        results[index] = await fn(items[index], index);
      } catch (error) {
        failure ??= error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  if (failure !== null) throw failure;
  return results;
}
