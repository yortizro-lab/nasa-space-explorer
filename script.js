
// =====================================
// NASA SPACE EXPLORER
// API, ARRAYS, LOOPS AND JSON
// =====================================

// 1. NASA API KEY
const NASA_API_KEY = "YOUR_NEW_NASA_API_KEY";

// 2. SELECT HTML ELEMENTS
const gallery = document.getElementById("galleryContainer");
const loadingMessage = document.getElementById("loadingMessage");
const errorMessage = document.getElementById("errorMessage");

const startDateInput = document.getElementById("startDate");
const searchButton = document.getElementById("searchButton");
const randomButton = document.getElementById("randomButton");

const imageModal = document.getElementById("imageModal");
const modalImage = document.getElementById("modalImage");
const modalTitle = document.getElementById("modalTitle");
const modalDate = document.getElementById("modalDate");
const modalExplanation = document.getElementById("modalExplanation");
const modalLink = document.getElementById("modalLink");
const closeModal = document.getElementById("closeModal");

// 3. ARRAY TO STORE NASA DISCOVERIES
let spaceDiscoveries = [];

// 4. SET TODAY'S DATE
const today = new Date();
const todayString = today.toISOString().split("T")[0];

startDateInput.max = todayString;
startDateInput.value = todayString;

// 5. NASA API FUNCTION
async function getSpaceDiscoveries(startDate, endDate) {

  loadingMessage.textContent = "🌌 Exploring the universe...";
  errorMessage.textContent = "";
  gallery.innerHTML = "";

  try {

    // API URL
    const apiURL =
      `https://science.nasa.gov/wp-json/wp/v2/apod-basic/` +
      `?start_date=${startDate}&end_date=${endDate}` +
      `&api_key=${NASA_API_KEY}`;

    // FETCH DATA FROM NASA
    const response = await fetch(apiURL);

    if (!response.ok) {
      throw new Error("NASA API request failed.");
    }

    // CONVERT RESPONSE INTO JSON
    const jsonData = await response.json();

    // STORE DATA IN AN ARRAY
    spaceDiscoveries = Array.isArray(jsonData)
      ? jsonData
      : [jsonData];

    // SORT DISCOVERIES BY DATE
    spaceDiscoveries.sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    // DISPLAY DISCOVERIES USING A LOOP
    displayDiscoveries();

  } catch (error) {

    console.error("NASA API Error:", error);

    errorMessage.textContent =
      "Unable to load NASA discoveries. Please try again.";

    loadingMessage.textContent = "";

  }
}

// 6. DISPLAY NASA IMAGES USING A FOR LOOP
function displayDiscoveries() {

  gallery.innerHTML = "";

  if (spaceDiscoveries.length === 0) {
    loadingMessage.textContent = "No discoveries found.";
    return;
  }

  loadingMessage.textContent =
    `✨ Found ${spaceDiscoveries.length} space discoveries!`;

  for (let i = 0; i < spaceDiscoveries.length; i++) {

    const discovery = spaceDiscoveries[i];

    // Skip videos and entries without images
    if (discovery.media_type !== "image" || !discovery.url) {
      continue;
    }

    // CREATE IMAGE CARD
    const card = document.createElement("div");
    card.className = "space-card";

    const image = document.createElement("img");
    image.src = discovery.url;
    image.alt = discovery.alt || discovery.title;
    image.loading = "lazy";

    const cardInfo = document.createElement("div");
    cardInfo.className = "card-info";

    const title = document.createElement("h3");
    title.textContent = discovery.title;

    const date = document.createElement("p");
    date.textContent = `📅 ${discovery.date}`;

    const description = document.createElement("p");
    description.textContent =
      discovery.explanation
        ? discovery.explanation.substring(0, 110) + "..."
        : "Discover this amazing space image.";

    // ADD ELEMENTS TO CARD
    cardInfo.appendChild(title);
    cardInfo.appendChild(date);
    cardInfo.appendChild(description);

    card.appendChild(image);
    card.appendChild(cardInfo);

    // OPEN MODAL WHEN CARD IS CLICKED
    card.addEventListener("click", function() {
      openImageModal(discovery);
    });

    // ADD CARD TO GALLERY
    gallery.appendChild(card);
  }

}

// 7. OPEN IMAGE MODAL
function openImageModal(discovery) {

  modalImage.src = discovery.hdurl || discovery.url;
  modalImage.alt = discovery.alt || discovery.title;
  modalTitle.textContent = discovery.title;
  modalDate.textContent = `Date: ${discovery.date}`;
  modalExplanation.textContent = discovery.explanation;
  modalLink.href = discovery.permalink || discovery.url;

  imageModal.style.display = "block";
}

// 8. CLOSE IMAGE MODAL
closeModal.addEventListener("click", function() {
  imageModal.style.display = "none";
});

imageModal.addEventListener("click", function(event) {
  if (event.target === imageModal) {
    imageModal.style.display = "none";
  }
});

// 9. DATE SELECTOR
searchButton.addEventListener("click", function() {

  const selectedDate = startDateInput.value;

  if (!selectedDate) {
    errorMessage.textContent = "Please select a date.";
    return;
  }

  const start = new Date(selectedDate + "T12:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 8);

  const endDate = end > today
    ? todayString
    : end.toISOString().split("T")[0];

  getSpaceDiscoveries(selectedDate, endDate);

});

// 10. RANDOM DISCOVERY BUTTON
randomButton.addEventListener("click", async function() {

  loadingMessage.textContent = "🎲 Finding random discoveries...";

  try {

    const apiURL =
      `https://science.nasa.gov/wp-json/wp/v2/apod-basic/` +
      `?count=9&api_key=${NASA_API_KEY}`;

    const response = await fetch(apiURL);

    if (!response.ok) {
      throw new Error("Random discovery request failed.");
    }

    const jsonData = await response.json();

    spaceDiscoveries = Array.isArray(jsonData)
      ? jsonData
      : [jsonData];

    displayDiscoveries();

  } catch (error) {

    console.error(error);

    errorMessage.textContent =
      "Could not find random discoveries.";

    loadingMessage.textContent = "";

  }

});

// 11. START THE APPLICATION
getSpaceDiscoveries(todayString, todayString);
