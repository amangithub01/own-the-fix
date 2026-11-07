export function createSearch(fetchResults, displayResults) {
  return async function search(query) {
    const results = await fetchResults(query);
    displayResults(results);
  };
}
