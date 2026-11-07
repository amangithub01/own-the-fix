export function createSearch(fetchResults, displayResults) {
  let latestRequest = 0;
  return async function search(query) {
    const request = ++latestRequest;
    const results = await fetchResults(query);
    if (request === latestRequest) {
      displayResults(results);
    }
  };
}
