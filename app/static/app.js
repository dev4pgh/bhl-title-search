const form = document.querySelector("#search-form");
const statusEl = document.querySelector("#status");
const resultsEl = document.querySelector("#results");
const searchButton = document.querySelector("#search-button");

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `alert alert-${type}`;
}

function clearResults() {
  resultsEl.replaceChildren();
}

function appendEmptyMessage(message) {
  const paragraph = document.createElement("p");
  paragraph.className = "text-body-secondary mb-0";
  paragraph.textContent = message;
  resultsEl.appendChild(paragraph);
}

function createExternalLink(url, text) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = text;
  return link;
}

function createPageList(pages) {
  const list = document.createElement("ul");
  list.className = "list-group list-group-flush";

  for (const page of pages) {
    const item = document.createElement("li");
    item.className = "list-group-item px-0";

    const row = document.createElement("div");
    row.className = "d-flex flex-column flex-sm-row gap-2 align-items-sm-center justify-content-between";

    const pageLabel = page.page_number
      ? `Page ${page.page_number}`
      : `Page ID ${page.page_id}`;

    const label = document.createElement("span");
    label.textContent = pageLabel;
    row.appendChild(label);

    const links = document.createElement("div");
    links.className = "d-flex flex-wrap gap-2";

    if (page.page_url) {
      const pageLink = createExternalLink(page.page_url, "Open page");
      pageLink.className = "btn btn-sm btn-primary";
      links.appendChild(pageLink);
    }

    if (page.text_url) {
      const textLink = createExternalLink(page.text_url, "View text");
      textLink.className = "btn btn-sm btn-outline-secondary";
      links.appendChild(textLink);
    }

    if (page.image_url) {
      const imageLink = createExternalLink(page.image_url, "View image");
      imageLink.className = "btn btn-sm btn-outline-secondary";
      links.appendChild(imageLink);
    }

    row.appendChild(links);
    item.appendChild(row);
    list.appendChild(item);
  }

  return list;
}

function createItemCard(item) {
  const card = document.createElement("div");
  card.className = "card mb-3";

  const cardBody = document.createElement("div");
  cardBody.className = "card-body";

  const title = document.createElement("h3");
  title.className = "h5 card-title";

  const itemLabelParts = [];

  if (item.volume) {
    itemLabelParts.push(item.volume);
  }

  if (item.year) {
    itemLabelParts.push(item.year);
  }

  const itemLabel = itemLabelParts.length > 0
    ? itemLabelParts.join(" · ")
    : `Item ${item.item_id}`;

  if (item.item_url) {
    title.appendChild(createExternalLink(item.item_url, itemLabel));
  } else {
    title.textContent = itemLabel;
  }

  const summary = document.createElement("p");
  summary.className = "card-text text-body-secondary";
  summary.textContent = `${item.match_count} matching page(s)`;

  cardBody.appendChild(title);
  cardBody.appendChild(summary);

  if (item.pages && item.pages.length > 0) {
    cardBody.appendChild(createPageList(item.pages));
  }

  card.appendChild(cardBody);

  return card;
}

function renderResults(data) {
  clearResults();

  if (!data.matching_items || data.matching_items.length === 0) {
    appendEmptyMessage("No matching pages found.");
    return;
  }

  const titleBlock = document.createElement("div");
  titleBlock.className = "mb-4";

  const titleHeading = document.createElement("h3");
  titleHeading.className = "h5";

  if (data.title?.title_url) {
    titleHeading.appendChild(
      createExternalLink(data.title.title_url, data.title.full_title || "BHL title")
    );
  } else {
    titleHeading.textContent = data.title?.full_title || "BHL title";
  }

  const summary = document.createElement("p");
  summary.className = "text-body-secondary mb-0";
  summary.textContent =
    `Searched ${data.searched_item_count} item(s). ` +
    `Found ${data.total_matches} page match(es) across ` +
    `${data.matching_item_count} item(s).`;

  titleBlock.appendChild(titleHeading);
  titleBlock.appendChild(summary);
  resultsEl.appendChild(titleBlock);

  for (const item of data.matching_items) {
    resultsEl.appendChild(createItemCard(item));
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const params = new URLSearchParams(formData);

  searchButton.disabled = true;
  setStatus("Searching BHL...", "info");
  clearResults();
  appendEmptyMessage("Searching. Large titles may take a while.");

  try {
    const response = await fetch(`/api/bhl-title-search?${params}`);
    const data = await response.json();

    if (!response.ok) {
      setStatus("Search failed.", "danger");
      clearResults();
      appendEmptyMessage(JSON.stringify(data, null, 2));
      return;
    }

    setStatus(
      `Found ${data.total_matches} page match(es) across ${data.matching_item_count} item(s).`,
      "success"
    );

    renderResults(data);
  } catch (error) {
    setStatus("Search failed.", "danger");
    clearResults();
    appendEmptyMessage(String(error));
  } finally {
    searchButton.disabled = false;
  }
});