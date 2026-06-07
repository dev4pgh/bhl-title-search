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
const titleLookupCollapseEl = document.querySelector("#title-lookup-collapse");
const titleQueryInput = document.querySelector("#title-query");
const titlePanel = document.querySelector("#title-panel");
const titleStepBadge = document.querySelector("#title-step-badge");

const selectedTitleHeading = document.querySelector("#selected-title-heading");
const selectedTitleSummary = document.querySelector("#selected-title-summary");
const changeTitleButton = document.querySelector("#change-title-button");
const searchTextInput = document.querySelector("#text");
const searchPanel = document.querySelector("#search-panel");
const searchStepBadge = document.querySelector("#search-step-badge");
const searchStepHelp = document.querySelector("#search-step-help");

const resultsPanel = document.querySelector("#results-panel");
const resultsStepBadge = document.querySelector("#results-step-badge");
const resultsHeading = document.querySelector("#results-heading");

const searchProgress = document.querySelector("#search-progress");
const searchProgressLabel = document.querySelector("#search-progress-label");
const searchProgressDetail = document.querySelector("#search-progress-detail");
const searchProgressPercent = document.querySelector("#search-progress-percent");
const searchProgressContainer = document.querySelector("#search-progress-container");
const searchProgressBar = document.querySelector("#search-progress-bar");
const latestMatch = document.querySelector("#latest-match");

let activeSearchSource = null;

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `alert alert-${type}`;
}

function setLoading(isLoading) {
  searchButton.disabled = isLoading;
  searchSpinner.classList.toggle("d-none", !isLoading);
  searchButtonText.textContent = isLoading ? "Searching..." : "Search publication";
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

function appendResultsPlaceholder(message) {
  const paragraph = document.createElement("p");
  paragraph.id = "results-placeholder";
  paragraph.className = "text-body-secondary mb-0";
  paragraph.textContent = message;
  resultsEl.appendChild(paragraph);
}

function removeResultsPlaceholder() {
  const placeholder = document.querySelector("#results-placeholder");

  if (placeholder) {
    placeholder.remove();
  }
}

function resetSearchProgress() {
  searchProgress.classList.add("d-none");
  searchProgressLabel.textContent = "Searching volumes…";
  searchProgressDetail.textContent = "Preparing search.";
  searchProgressPercent.textContent = "0%";
  latestMatch.textContent = "";

  searchProgressContainer.setAttribute("aria-valuenow", "0");
  searchProgressBar.style.width = "0%";
  searchProgressBar.classList.add("progress-bar-striped", "progress-bar-animated");
}

function updateSearchProgress({
  searchedItemCount,
  availableItemCount,
  totalMatches,
  matchingItemCount,
  latestMessage = "",
  done = false,
}) {
  searchProgress.classList.remove("d-none");

  const percent = availableItemCount > 0
    ? Math.round((searchedItemCount / availableItemCount) * 100)
    : 0;

  searchProgressLabel.textContent = done
    ? "Search complete"
    : "Searching volumes…";

  searchProgressDetail.textContent =
    `Searched ${searchedItemCount} of ${availableItemCount} volume/item(s). ` +
    `Found ${totalMatches} page match(es) across ${matchingItemCount} item(s).`;

  searchProgressPercent.textContent = `${percent}%`;
  searchProgressContainer.setAttribute("aria-valuenow", String(percent));
  searchProgressBar.style.width = `${percent}%`;

  if (latestMessage) {
    latestMatch.textContent = latestMessage;
  }

  if (done) {
    searchProgressBar.classList.remove("progress-bar-striped", "progress-bar-animated");
  }
}

function markSearchProgressFailed() {
  searchProgress.classList.remove("d-none");
  searchProgressLabel.textContent = "Search stopped";
  searchProgressBar.classList.remove("progress-bar-striped", "progress-bar-animated");
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

    if (page.snippet) {
      const snippet = document.createElement("p");
      snippet.className = "mt-2 mb-0 small text-body-secondary";
      appendHighlightedText(snippet, page.snippet, page.search_text);
      item.appendChild(snippet);
    }

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

function createResultsTitleBlock(titleData, searchedItemCount, matchingItemCount, totalMatches) {
  const titleBlock = document.createElement("div");
  titleBlock.className = "mb-4";

  const titleHeading = document.createElement("h3");
  titleHeading.className = "h5";

  if (titleData?.title_url) {
    titleHeading.appendChild(
      createExternalLink(titleData.title_url, titleData.full_title || "BHL title")
    );
  } else {
    titleHeading.textContent = titleData?.full_title || "BHL title";
  }

  const summary = document.createElement("p");
  summary.className = "text-body-secondary mb-0";
  summary.textContent =
    `Searched ${searchedItemCount} item(s). ` +
    `Found ${totalMatches} page match(es) across ` +
    `${matchingItemCount} item(s).`;

  titleBlock.appendChild(titleHeading);
  titleBlock.appendChild(summary);

  return titleBlock;
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
  meta.textContent = `Title number: ${candidate.title_id}`;

  button.appendChild(title);

  if (subtitle.textContent) {
    button.appendChild(subtitle);
  }

  button.appendChild(meta);

  button.addEventListener("click", () => {
    titleIdInput.value = candidate.title_id;
    showSelectedTitle(candidate);

    setStatus("Title selected. Enter search text below and run the search.", "success");

    if (titleLookupCollapseEl.classList.contains("show")) {
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
    } else {
      selectedTitleHeading.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
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

function setActiveWorkflowStep(step) {
  const titleIsActive = step === 1;
  const searchIsActive = step === 2;
  const resultsAreActive = step === 3;

  titlePanel.classList.toggle("border-primary", titleIsActive);
  titlePanel.classList.toggle("border-secondary-subtle", !titleIsActive);

  titleStepBadge.className = titleIsActive
    ? "badge rounded-pill text-bg-primary fs-6"
    : "badge rounded-pill text-bg-success fs-6";

  searchPanel.classList.toggle("border-primary", searchIsActive);
  searchPanel.classList.toggle("border-secondary-subtle", !searchIsActive);
  searchPanel.classList.toggle("bg-body-secondary", !searchIsActive);

  searchStepBadge.className = searchIsActive
    ? "badge rounded-pill text-bg-primary fs-6"
    : step > 2
      ? "badge rounded-pill text-bg-success fs-6"
      : "badge rounded-pill text-bg-secondary fs-6";

  resultsPanel.classList.toggle("border-primary", resultsAreActive);
  resultsPanel.classList.toggle("border-secondary-subtle", !resultsAreActive);
  resultsPanel.classList.toggle("bg-body-secondary", !resultsAreActive);

  resultsStepBadge.className = resultsAreActive
    ? "badge rounded-pill text-bg-primary"
    : "badge rounded-pill text-bg-secondary";
}

function showSelectedTitle(candidate) {
  selectedTitleSummary.replaceChildren();
  selectedTitleSummary.className = "alert alert-success";

  const title = document.createElement("div");
  title.className = "fw-semibold";
  title.textContent = candidate.title || `BHL title ${candidate.title_id}`;

  const meta = document.createElement("div");
  meta.className = "small";
  meta.textContent = `Selected BHL title number: ${candidate.title_id}`;

  selectedTitleSummary.appendChild(title);
  selectedTitleSummary.appendChild(meta);

  changeTitleButton.classList.remove("d-none");

  setActiveWorkflowStep(2);
  searchStepHelp.textContent = "Enter the text you want to find across this publication’s volumes.";
  searchButton.disabled = false;
}

function activateResultsStep() {
  setActiveWorkflowStep(3);
}

setActiveWorkflowStep(1);
resetSearchProgress();

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

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!titleIdInput.value) {
    setStatus("Choose a BHL publication first, or enter a title number manually.", "warning");
    selectedTitleHeading.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
    return;
  }

  if (activeSearchSource) {
    activeSearchSource.close();
    activeSearchSource = null;
  }

  const formData = new FormData(form);
  const params = new URLSearchParams(formData);

  setLoading(true);
  clearResults();
  resetSearchProgress();
  setStatus("Starting search...", "info");

  activeSearchSource = new EventSource(`/api/bhl-title-search-stream?${params}`);

  let titleData = null;
  let searchedItemCount = 0;
  let availableItemCount = 0;
  let matchingItemCount = 0;
  let totalMatches = 0;

  activeSearchSource.addEventListener("start", (event) => {
    const data = JSON.parse(event.data);

    titleData = data.title;
    availableItemCount = data.available_item_count;

    clearResults();
    appendResultsPlaceholder(`Searching ${availableItemCount} volume/item(s)...`);

    updateSearchProgress({
      searchedItemCount: 0,
      availableItemCount,
      totalMatches: 0,
      matchingItemCount: 0,
    });

    setStatus(`Searching 0 of ${availableItemCount} volume/item(s)...`, "info");

    resultsHeading.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });

  activeSearchSource.addEventListener("progress", (event) => {
    const data = JSON.parse(event.data);

    searchedItemCount = data.searched_item_count;
    availableItemCount = data.available_item_count;
    matchingItemCount = data.matching_item_count;
    totalMatches = data.total_matches;

    updateSearchProgress({
      searchedItemCount,
      availableItemCount,
      totalMatches,
      matchingItemCount,
    });

    setStatus(
      `Searched ${searchedItemCount} of ${availableItemCount} volume/item(s). ` +
      `Found ${totalMatches} page match(es) so far.`,
      "info"
    );
  });

  activeSearchSource.addEventListener("item", (event) => {
    const data = JSON.parse(event.data);

    searchedItemCount = data.searched_item_count;
    availableItemCount = data.available_item_count;
    matchingItemCount = data.matching_item_count;
    totalMatches = data.total_matches;

    removeResultsPlaceholder();
    resultsEl.appendChild(createItemCard(data.item));

    const itemLabel = data.item.volume || data.item.year || `Item ${data.item.item_id}`;

    updateSearchProgress({
      searchedItemCount,
      availableItemCount,
      totalMatches,
      matchingItemCount,
      latestMessage: `Latest match: ${itemLabel} (${data.item.match_count} page match(es))`,
    });

    setStatus(
      `Searched ${searchedItemCount} of ${availableItemCount} volume/item(s). ` +
      `Found ${totalMatches} page match(es) so far.`,
      "info"
    );
  });

  activeSearchSource.addEventListener("done", (event) => {
    const data = JSON.parse(event.data);

    searchedItemCount = data.searched_item_count;
    availableItemCount = data.available_item_count;
    matchingItemCount = data.matching_item_count;
    totalMatches = data.total_matches;

    if (titleData && matchingItemCount > 0) {
      resultsEl.prepend(
        createResultsTitleBlock(
          titleData,
          searchedItemCount,
          matchingItemCount,
          totalMatches
        )
      );
    }

    if (matchingItemCount === 0) {
      clearResults();
      appendEmptyMessage("No matching pages found.");
    }

    updateSearchProgress({
      searchedItemCount,
      availableItemCount,
      totalMatches,
      matchingItemCount,
      done: true,
    });

    setStatus(
      `Search complete. Found ${totalMatches} page match(es) across ${matchingItemCount} item(s).`,
      "success"
    );

    activateResultsStep();
    setLoading(false);

    activeSearchSource.close();
    activeSearchSource = null;
  });

  activeSearchSource.addEventListener("error", (event) => {
    let message = "Search failed.";

    if (event.data) {
      try {
        const data = JSON.parse(event.data);
        message = data.message || message;
      } catch {
        // Keep the default message.
      }
    }

    markSearchProgressFailed();
    setStatus(message, "danger");
    setLoading(false);

    if (activeSearchSource) {
      activeSearchSource.close();
      activeSearchSource = null;
    }
  });
});

changeTitleButton.addEventListener("click", () => {
  setActiveWorkflowStep(1);
  showTitleLookupResults();

  titleLookupForm.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
});