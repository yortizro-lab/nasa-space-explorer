// =====================================
// NASA SPACE EXPLORER
// Local requests use our server's private NASA key. GitHub Pages uses NASA's
// public, rate-limited DEMO_KEY because Pages cannot run the server.
// =====================================

const IS_GITHUB_PAGES = window.location.hostname.endsWith(".github.io");
const APOD_ENDPOINT = IS_GITHUB_PAGES
  ? "https://api.nasa.gov/planetary/apod"
  : "/api/apod";
const NASA_DEMO_KEY = "DEMO_KEY";
const APOD_FIRST_DATE = "1995-06-16";
const DAY_MS = 86400000;

// 1. SELECT HTML ELEMENTS
const gallery = document.getElementById("galleryContainer");
const featured = document.getElementById("featured");
const loadingMessage = document.getElementById("loadingMessage");
const errorMessage = document.getElementById("errorMessage");
const spaceFactMessage = document.getElementById("spaceFactMessage");

const startDateInput = document.getElementById("startDate");
const searchButton = document.getElementById("searchButton");
const randomButton = document.getElementById("randomButton");

const imageModal = document.getElementById("imageModal");
const modalImage = document.getElementById("modalImage");
const modalVideo = document.getElementById("modalVideo");
const modalTitle = document.getElementById("modalTitle");
const modalDate = document.getElementById("modalDate");
const modalExplanation = document.getElementById("modalExplanation");
const modalLink = document.getElementById("modalLink");
const closeModal = document.getElementById("closeModal");

let spaceDiscoveries = [];
let latestRequestId = 0;
let modalReturnFocus = null;

const SPACE_FACTS = [
  "🌌 Light from distant galaxies has been traveling for billions of years to reach us, showing us the universe as it was in the past.",
  "🚀 NASA's Voyager 1, launched in 1977, is still sending data from interstellar space and is humanity's farthest spacecraft.",
  "⭐ The Sun is so massive that it accounts for 99.86% of all the mass in our entire solar system.",
  "🪐 Jupiter's Great Red Spot is a storm that has been raging for at least 350 years and is larger than Earth.",
  "🌍 Earth's atmosphere extends about 120 kilometers into space, marking the boundary of outer space.",
  "💫 A single teaspoon of neutron star material would weigh as much as 6 billion tons on Earth.",
  "🛰️ The International Space Station orbits Earth approximately every 90 minutes at 17,500 miles per hour.",
  "🌙 The Moon is slowly drifting away from Earth at a rate of about 1.5 inches per year.",
  "☄️ An asteroid impact 66 million years ago led to the extinction of the dinosaurs.",
  "✨ There are more stars in the universe than grains of sand on all Earth's beaches and deserts combined.",
];

function getRandomSpaceFact() {
  return SPACE_FACTS[Math.floor(Math.random() * SPACE_FACTS.length)];
}

// 2. DATE HELPERS (calendar dates as YYYY-MM-DD, handled in UTC to avoid shifts)
function toDateString(ms) {
  return new Date(ms).toISOString().split("T")[0];
}

function toMs(dateString) {
  return Date.parse(dateString + "T00:00:00Z");
}

// Today's calendar date in the user's timezone
const now = new Date();
const todayString = toDateString(
  Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
);

startDateInput.min = APOD_FIRST_DATE;
startDateInput.max = todayString;
startDateInput.value = todayString;

// 3. NASA API HELPER
const NASA_APOD_URL = "https://api.nasa.gov/planetary/apod";
// Set when the local proxy is missing (page not served by server.js)
let proxyUnavailable = IS_GITHUB_PAGES;

async function requestApod(params, direct) {
  const query = new URLSearchParams(params);
  if (direct) query.set("api_key", NASA_DEMO_KEY);
  const response = await fetch(`${direct ? NASA_APOD_URL : APOD_ENDPOINT}?${query}`);
  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { response, data };
}

async function fetchApod(params) {
  let response;
  let data;
  try {
    ({ response, data } = await requestApod(params, proxyUnavailable));
  } catch (error) {
    if (proxyUnavailable) throw error;
    proxyUnavailable = true;
    ({ response, data } = await requestApod(params, true));
  }

  if (!proxyUnavailable && data === null) {
    // No JSON from /api/apod: fall back to NASA's public DEMO_KEY
    proxyUnavailable = true;
    ({ response, data } = await requestApod(params, true));
  }
  if (data === null) {
    throw new Error("NASA returned an unreadable response.");
  }
  if (!response.ok) {
    const message = (data && (data.msg || data.error?.message || data.error)) || "";
    const error = new Error(message || `NASA API error (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return Array.isArray(data) ? data : [data];
}

// 4. LOAD DISCOVERIES: 9 entries starting at startDate when available.
// The entry whose date equals `focusDate` is shown in the featured panel.
async function loadDiscoveries(startDate, focusDate, loadingText) {
  const requestId = ++latestRequestId;

  loadingMessage.textContent = loadingText || "🌌 Exploring the universe...";
  errorMessage.textContent = "";
  gallery.innerHTML = "";
  featured.hidden = true;
  spaceFactMessage.hidden = true;
  searchButton.disabled = randomButton.disabled = true;

  let endMs = Math.min(toMs(startDate) + 8 * DAY_MS, toMs(todayString));
  let endDate = toDateString(endMs);
  let rangeStart = toDateString(endMs - 8 * DAY_MS);

  try {
    let results;
    try {
      results = await fetchApod({ start_date: rangeStart, end_date: endDate, thumbs: "true" });
    } catch (error) {
      // Today's picture may not be published yet (NASA publishes in US time)
      if (endDate !== todayString || error.status !== 400) throw error;
      endMs -= DAY_MS;
      endDate = toDateString(endMs);
      rangeStart = toDateString(endMs - 8 * DAY_MS);
      results = await fetchApod({
        start_date: rangeStart,
        end_date: endDate,
        thumbs: "true",
      });
    }

    if (requestId !== latestRequestId) return;

    // Some successful responses omit today's unpublished entry.
    if (endDate === todayString && results.length === 8 &&
        results.every((item) => item.date !== todayString)) {
      endMs -= DAY_MS;
      endDate = toDateString(endMs);
      rangeStart = toDateString(endMs - 8 * DAY_MS);
      results = await fetchApod({ start_date: rangeStart, end_date: endDate, thumbs: "true" });
      if (requestId !== latestRequestId) return;
    }

    const dates = new Set(results.map((item) => item.date));
    if (results.length !== 9 || dates.size !== 9 ||
        Array.from({ length: 9 }, (_, i) => toDateString(toMs(rangeStart) + i * DAY_MS))
          .some((date) => !dates.has(date))) {
      throw new Error("NASA did not return nine consecutive discoveries. Please try another date.");
    }

    spaceDiscoveries = results.sort((a, b) => a.date.localeCompare(b.date));

    const focus =
      spaceDiscoveries.find((d) => d.date === focusDate) ||
      spaceDiscoveries[spaceDiscoveries.length - 1];

    displayFeatured(focus);
    displayDiscoveries();
    loadingMessage.textContent = "";
    if (focusDate > endDate) {
      errorMessage.textContent = `The discovery for ${focusDate} is not available yet. Showing the latest nine available days.`;
    }
  } catch (error) {
    console.error("NASA API Error:", error);
    if (requestId !== latestRequestId) return;
    errorMessage.textContent =
      `Unable to load NASA discoveries. ${error.message || "Please try again."}`;
    loadingMessage.textContent = "";
  } finally {
    if (requestId === latestRequestId) searchButton.disabled = randomButton.disabled = false;
  }
}

// 5. MEDIA HELPERS
function isHttps(url) {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function createMissingMedia(discovery) {
  const box = document.createElement("div");
  box.className = "video-placeholder";
  const link = document.createElement("a");
  link.href = discovery.url && isHttps(discovery.url) ? discovery.url : "https://apod.nasa.gov/apod/";
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = discovery.media_type === "video"
    ? "▶ Watch this NASA video"
    : "Image unavailable – view on NASA";
  box.appendChild(link);
  return box;
}

// Image element for a discovery; falls back to a link if loading fails
function createMedia(discovery, useHd) {
  if (discovery.media_type === "video") {
    if (discovery.thumbnail_url && isHttps(discovery.thumbnail_url)) {
      const thumb = document.createElement("img");
      thumb.src = discovery.thumbnail_url;
      thumb.alt = `Video thumbnail: ${discovery.title}`;
      thumb.loading = "lazy";
      return thumb;
    }
    return createMissingMedia(discovery);
  }

  const source = (useHd && discovery.hdurl) || discovery.url;
  if (!source || !isHttps(source)) return createMissingMedia(discovery);

  const image = document.createElement("img");
  image.src = source;
  image.alt = discovery.title;
  image.loading = "lazy";
  image.addEventListener("error", function () {
    if (useHd && discovery.hdurl && image.src !== discovery.url && discovery.url) {
      image.src = discovery.url;
      return;
    }
    image.replaceWith(createMissingMedia(discovery));
  });
  return image;
}

// 6. FEATURED DISCOVERY (today / selected / random date)
function displayFeatured(discovery) {
  featured.innerHTML = "";

  let media;
  if (discovery.media_type === "video" && isHttps(discovery.url) && /youtube|vimeo|youtu\.be/.test(discovery.url)) {
    media = document.createElement("iframe");
    media.src = discovery.url;
    media.title = discovery.title;
    media.allowFullscreen = true;
  } else {
    media = createMedia(discovery, true);
  }

  const info = document.createElement("div");
  info.className = "featured-info";

  const title = document.createElement("h3");
  title.textContent = discovery.title;

  const date = document.createElement("p");
  date.textContent = `📅 ${discovery.date}`;

  const text = document.createElement("p");
  text.textContent = discovery.explanation || "No explanation provided by NASA.";

  const credit = document.createElement("p");
  if (discovery.copyright) credit.textContent = `© ${discovery.copyright.trim()}`;

  info.append(title, date, text);
  if (discovery.copyright) info.appendChild(credit);

  featured.append(media, info);
  featured.hidden = false;
}

// 7. GALLERY CARDS
function displayDiscoveries() {
  gallery.innerHTML = "";

  spaceFactMessage.textContent = getRandomSpaceFact();
  spaceFactMessage.hidden = false;

  for (let i = 0; i < spaceDiscoveries.length; i++) {
    const discovery = spaceDiscoveries[i];

    const card = document.createElement("div");
    card.className = "space-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `View ${discovery.title}`);

    const cardInfo = document.createElement("div");
    cardInfo.className = "card-info";

    const source = document.createElement("span");
    source.className = "card-source";
    source.textContent = "NASA";

    const title = document.createElement("h3");
    title.textContent = discovery.title;

    const date = document.createElement("p");
    date.textContent = `📅 ${discovery.date}${discovery.media_type === "video" ? " · 🎬 Video" : ""}`;

    const description = document.createElement("p");
    const explanation = discovery.explanation || "";
    description.textContent = explanation
      ? explanation.substring(0, 110) + (explanation.length > 110 ? "..." : "")
      : "Discover this amazing space image.";

    const action = document.createElement("span");
    action.className = "card-action";
    action.textContent = "Click to read the explanation";

    cardInfo.append(source, title, date, description, action);
    card.append(createMedia(discovery, false), cardInfo);

    card.addEventListener("click", function (event) {
      if (event.target.closest("a")) return;
      openImageModal(discovery);
    });
    card.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openImageModal(discovery);
      }
    });

    gallery.appendChild(card);
  }
}

// 8. MODAL
function openImageModal(discovery) {
  modalReturnFocus = document.activeElement;
  const isVideo = discovery.media_type === "video";
  const embeddable = isVideo && isHttps(discovery.url) && /youtube|vimeo|youtu\.be/.test(discovery.url);

  modalImage.hidden = isVideo;
  modalVideo.hidden = !embeddable;

  if (isVideo) {
    modalImage.removeAttribute("src");
    modalVideo.src = embeddable ? discovery.url : "";
  } else {
    modalVideo.src = "";
    modalImage.onerror = function () {
      if (discovery.url && modalImage.src !== discovery.url) modalImage.src = discovery.url;
    };
    modalImage.src = discovery.hdurl || discovery.url || "";
  }

  modalImage.alt = discovery.title;
  modalTitle.textContent = discovery.title;
  modalDate.textContent = `Date: ${discovery.date}`;
  modalExplanation.textContent = discovery.explanation
    || "NASA hasn't provided an explanation for this discovery.";
  modalLink.href = `https://apod.nasa.gov/apod/ap${discovery.date.slice(2).replace(/-/g, "")}.html`;

  imageModal.setAttribute("aria-hidden", "false");
  imageModal.style.display = "block";
  document.body.classList.add("modal-open");
  closeModal.focus();
}

function hideModal() {
  imageModal.setAttribute("aria-hidden", "true");
  imageModal.style.display = "none";
  document.body.classList.remove("modal-open");
  modalVideo.src = "";
  if (modalReturnFocus instanceof HTMLElement) modalReturnFocus.focus();
  modalReturnFocus = null;
}

closeModal.addEventListener("click", hideModal);
document.addEventListener("keydown", function (event) {
  if (imageModal.style.display !== "block") return;
  if (event.key === "Escape") return hideModal();
  if (event.key !== "Tab") return;

  // Keep keyboard focus inside the open dialog
  const focusable = [...imageModal.querySelectorAll("a[href], button, iframe")]
    .filter((el) => !el.hidden && el.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!imageModal.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
imageModal.addEventListener("click", function (event) {
  if (event.target === imageModal) hideModal();
});

// 9. DATE SELECTOR
searchButton.addEventListener("click", function () {
  const selectedDate = startDateInput.value;

  if (!selectedDate) {
    errorMessage.textContent = "Please select a date.";
    return;
  }
  if (selectedDate < APOD_FIRST_DATE || selectedDate > todayString) {
    errorMessage.textContent = `Please choose a date between ${APOD_FIRST_DATE} and ${todayString}.`;
    return;
  }

  loadDiscoveries(selectedDate, selectedDate);
});

startDateInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") searchButton.click();
});

// 10. RANDOM DISCOVERY: random date within APOD's available range
randomButton.addEventListener("click", function () {
  const first = toMs(APOD_FIRST_DATE);
  const last = toMs(todayString) - DAY_MS; // yesterday is always published
  const randomDate = toDateString(
    first + Math.floor(Math.random() * ((last - first) / DAY_MS + 1)) * DAY_MS
  );

  startDateInput.value = randomDate;
  loadDiscoveries(randomDate, randomDate, "🎲 Finding a random discovery...");
});

// 11. START: today's picture plus the 8 days before it
loadDiscoveries(toDateString(toMs(todayString) - 8 * DAY_MS), todayString);
