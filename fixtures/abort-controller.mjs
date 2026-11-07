export function createSearch(fetchResults, displayResults) {
  let controller;
  return async function search(query) {
    controller?.abort();
    const current = new AbortController();
    controller = current;
    try {
      const results = await fetchResults(query, { signal: current.signal });
      if (!current.signal.aborted) {
        displayResults(results);
      }
    } catch (error) {
      if (error.name !== 'AbortError') throw error;
    }
  };
}
