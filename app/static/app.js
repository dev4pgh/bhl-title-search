const form = document.querySelector("#search-form");
const statusEl = document.querySelector("#status");
const resultsEl = document.querySelector("#results");
const searchButton = document.querySelector("#search-button");
const searchSpinner = document.querySelector("#search-spinner");
const searchButtonText = document.querySelector("#search-button-text");
const titleLookupForm = document.querySelector("#title-lookup-form");
const titleLookupResultsEl = document.querySelector("#title-lookup-results");
const titleLookupButton = document.querySelector("#title-lookup-button");
const titleIdInput = document.querySelector("#title-id");
const selectedTitleHeading = document.querySelector("#selected-title-heading");
const selectedTitleSummary = document.querySelector("#selected-title-summary");
const titleLookupCollapseEl = document.querySelector("#title-lookup-collapse");
const changeTitleButton = document.querySelector("#change-title-button");
const titleQueryInput = document.querySelector("#title-query");
const searchTextInput = document.querySelector("#text");

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `alert alert-${type}`;
}

function setLoading(isLoading) {
  searchButton.disabled = isLoading;
  searchSpinner.classList.toggle("d-none", !isLoading);
  searchButtonText.textContent = isLoading ? "Searching..." : "Search";
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

function appendHighlightedText(parent, text, searchText) {
  if (!text || !searchText) {
    parent.textContent = text || "";
    return;
  }

  const lowerText = text.toLowerCase();
  const lowerSearchText = searchText.toLowerCase();

  let cursor = 0;
  let matchIndex = lowerText.indexOf(lowerSearchText);

  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      parent.appendChild(
        document.createTextNode(text.slice(cursor, matchIndex))
      );
    }

    const mark = document.createElement("mark");
    mark.textContent = text.slice(matchIndex, matchIndex + searchText.length);
    parent.appendChild(mark);

    cursor = matchIndex + searchText.length;
    matchIndex = lowerText.indexOf(lowerSearchText, cursor);
  }

  if (cursor < text.length) {
    parent.appendChild(document.createTextNode(text.slice(cursor)));
  }
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
    if (page.snippet) {
        const snippet = document.createElement("p");
        snippet.className = "mt-2 mb-0 small text-body-secondary";
        appendHighlightedText(snippet, page.snippet, page.search_text);
        item.appendChild(snippet);
    }
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

function getTitleLookupCollapse() {
  return bootstrap.Collapse.getOrCreateInstance(titleLookupCollapseEl, {
    toggle: false
  });
}

function showTitleLookupResults() {
  getTitleLookupCollapse().show();
}

function hideTitleLookupResults() {
  getTitleLookupCollapse().hide();
}

function clearTitleLookupResults({ hide = false } = {}) {
  titleLookupResultsEl.replaceChildren();

  if (hide) {
    hideTitleLookupResults();
  }
}

function formatCandidateSubtitle(candidate) {
  const parts = [];

  if (candidate.authors && candidate.authors.length > 0) {
    parts.push(candidate.authors.join(", "));
  }

  if (candidate.date) {
    parts.push(candidate.date);
  }

  if (candidate.genre) {
    parts.push(candidate.genre);
  }

  return parts.join(" · ");
}

function createTitleCandidateButton(candidate) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "list-group-item list-group-item-action";

  const title = document.createElement("div");
  title.className = "fw-semibold";
  title.textContent = candidate.title || `BHL title ${candidate.title_id}`;

  const subtitle = document.createElement("div");
  subtitle.className = "small text-body-secondary";
  subtitle.textContent = formatCandidateSubtitle(candidate);

  const meta = document.createElement("div");
  meta.className = "small text-body-secondary";
  meta.textContent = `Title ID: ${candidate.title_id}`;

  button.appendChild(title);

  if (subtitle.textContent) {
    button.appendChild(subtitle);
  }

  button.appendChild(meta);

  button.addEventListener("click", () => {
    titleIdInput.value = candidate.title_id;
    showSelectedTitle(candidate);

    setStatus("Title selected. Enter search text below and run the search.", "success");

    titleLookupCollapseEl.addEventListener(
        "hidden.bs.collapse",
        () => {
        selectedTitleHeading.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
        },
        { once: true }
    );

    hideTitleLookupResults();
 });

  return button;
}

function renderTitleCandidates(candidates) {
  clearTitleLookupResults();

  if (!candidates || candidates.length === 0) {
    showTitleLookupResults();

    const empty = document.createElement("div");
    empty.className = "list-group-item text-body-secondary";
    empty.textContent = "No matching BHL titles found.";
    titleLookupResultsEl.appendChild(empty);
    return;
  }

  showTitleLookupResults();

  for (const candidate of candidates) {
    titleLookupResultsEl.appendChild(createTitleCandidateButton(candidate));
  }
}

function showSelectedTitle(candidate) {
  selectedTitleSummary.replaceChildren();
  selectedTitleSummary.className = "alert alert-success";

  const title = document.createElement("div");
  title.className = "fw-semibold";
  title.textContent = candidate.title || `BHL title ${candidate.title_id}`;

  const meta = document.createElement("div");
  meta.className = "small";
  meta.textContent = `Selected title ID: ${candidate.title_id}`;

  selectedTitleSummary.appendChild(title);
  selectedTitleSummary.appendChild(meta);

  changeTitleButton.classList.remove("d-none");
}

titleLookupForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(titleLookupForm);
  const params = new URLSearchParams(formData);

  titleLookupButton.disabled = true;
  setStatus("Searching BHL titles...", "info");
  clearTitleLookupResults();

  try {
    const response = await fetch(`/api/bhl-title-lookup?${params}`);
    const data = await response.json();

    if (!response.ok) {
      setStatus("Title lookup failed.", "danger");
      renderTitleCandidates([]);
      return;
    }

    setStatus(`Found ${data.candidate_count} candidate title(s).`, "success");
    renderTitleCandidates(data.candidates);
  } catch (error) {
    setStatus("Title lookup failed.", "danger");
    renderTitleCandidates([]);
  } finally {
    titleLookupButton.disabled = false;
  }
});

document.querySelectorAll(".example-title").forEach((button) => {
  button.addEventListener("click", () => {
    titleQueryInput.value = button.dataset.title;
    titleQueryInput.focus();
  });
});

document.querySelectorAll(".example-search-text").forEach((button) => {
  button.addEventListener("click", () => {
    searchTextInput.value = button.dataset.text;
    searchTextInput.focus();
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const params = new URLSearchParams(formData);

  setLoading(true);
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
    setLoading(false);
  }
});

changeTitleButton.addEventListener("click", () => {
  showTitleLookupResults();

  titleLookupForm.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
});