const form = document.querySelector("#search-form");
const statusEl = document.querySelector("#status");
const resultsEl = document.querySelector("#results");
const searchButton = document.querySelector("#search-button");

function setStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = `alert alert-${type}`;
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const params = new URLSearchParams(formData);

    searchButton.disabled = true;
    setStatus("Searching BHL...", "info");
    resultsEl.textContent = "";

    try {
        const response = await fetch(`/api/bhl-title-search?${params}`);
        const data = await response.json();

        if (!response.ok) {
            setStatus("Search failed.", "danger");
        } else {
            setStatus(
                `Found ${data.total_matches} page match(es) across ${data.matching_item_count} item(s).`,
                "success"
            );
        }

        resultsEl.textContent = JSON.stringify(data, null, 2);
    } catch (error) {
        setStatus("Search failed.", "danger");
        resultsEl.textContent = String(error);
    } finally {
        searchButton.disabled = false;
    }
});