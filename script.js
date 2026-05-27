document.addEventListener("DOMContentLoaded", () => {
  const galleryGrid = document.getElementById("galleryGrid");
  const mediaUpload = document.getElementById("mediaUpload");
  const loadingSpinner = document.getElementById("loadingSpinner");
  const emptyState = document.getElementById("emptyState");

  // Lightbox Selectors
  const lightbox = document.getElementById("lightbox");
  const lightboxContent = document.getElementById("lightboxContent");
  const lightboxTitle = document.getElementById("lightboxTitle");
  const lightboxLocation = document.getElementById("lightboxLocation");
  const lightboxClose = document.getElementById("lightboxClose");

  let mediaPool = [];
  let isFetching = false;
  let db = null;

  // Open/Create IndexedDB
  const request = indexedDB.open("ImmersiveGalleryDB", 1);

  request.onupgradeneeded = (e) => {
    const d = e.target.result;
    if (!d.objectStoreNames.contains("vault")) {
      d.createObjectStore("vault", { keyPath: "id", autoIncrement: true });
    }
  };

  request.onsuccess = (e) => {
    db = e.target.result;
    loadVaultMedia();
  };

  /**
   * Fetch records and structuralize initial viewport layout
   */
  function loadVaultMedia() {
    const store = db.transaction(["vault"], "readonly").objectStore("vault");
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = () => {
      const records = getAllRequest.result;
      if (records.length > 0) {
        emptyState.style.display = "none";
        loadingSpinner.classList.remove("hidden");
        // Order by newest first
        records.sort((a, b) => b.timestamp - a.timestamp);
        records.forEach((item) => {
          const localURL = URL.createObjectURL(item.file);
          renderItem(localURL, item.type, item.title, item.location, item.id);
        });
        refreshInfinitePool();
      } else {
        emptyState.style.display = "flex";
        loadingSpinner.classList.add("hidden");
      }
    };
  }

  /**
   * User Action: Interactive Prompted Upload Processing
   */
  mediaUpload.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    for (const file of files) {
      // Prompt the user beautifully for metadata
      const customTitle =
        prompt(
          `Enter a Title for this ${file.type.startsWith("video/") ? "video" : "photo"}:`,
        ) || "Untitled";
      const customLocation =
        prompt("Enter Location (Optional):") || "Unknown Location";

      const transaction = db.transaction(["vault"], "readwrite");
      const store = transaction.objectStore("vault");

      const itemData = {
        file: file, // Keeps the actual raw media file inside the browser database
        type: file.type,
        title: customTitle,
        location: customLocation,
        timestamp: Date.now(),
      };

      store.add(itemData).onsuccess = (e) => {
        const generatedId = e.target.result;
        const localURL = URL.createObjectURL(file);

        emptyState.style.display = "none";
        loadingSpinner.classList.remove("hidden");

        // Render straight to viewport structure
        renderItem(
          localURL,
          file.type,
          customTitle,
          customLocation,
          generatedId,
        );
        refreshInfinitePool();
      };
    }
    mediaUpload.value = ""; // clean out track memory buffer
  });

  /**
   * Structural Document Element Generator
   */
  function renderItem(url, type, title, location, id) {
    const card = document.createElement("div");
    card.classList.add("gallery-item");
    card.dataset.id = id;
    card.dataset.type = type;
    card.dataset.url = url;
    card.dataset.title = title;
    card.dataset.location = location;

    // Construct Media Element
    let mediaTag;
    if (type.startsWith("image/")) {
      mediaTag = document.createElement("img");
      mediaTag.src = url;
      mediaTag.alt = title;
    } else {
      mediaTag = document.createElement("video");
      mediaTag.src = url;
      mediaTag.loop = true;
      mediaTag.muted = true;
      mediaTag.setAttribute("playsinline", "");

      const badge = document.createElement("div");
      badge.classList.add("video-badge");
      badge.textContent = "Video";
      card.appendChild(badge);
    }
    card.appendChild(mediaTag);

    // Build Hover Info Overlay
    const overlay = document.createElement("div");
    overlay.classList.add("item-overlay");
    overlay.innerHTML = `
          <div class="item-title">${title}</div>
          <div class="item-location">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              ${location}
          </div>
      `;
    card.appendChild(overlay);

    // Delete Button Structure
    const deleteBtn = document.createElement("button");
    deleteBtn.classList.add("delete-btn");
    deleteBtn.title = "Delete permanently";
    deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // Avoid triggering Lightbox click on the card parent
      if (confirm(`Are you sure you want to delete "${title}"?`)) {
        executeDeletion(id, card);
      }
    });
    card.appendChild(deleteBtn);

    // Lightbox Click System Event Integration
    card.addEventListener("click", () =>
      activeLightbox(url, type, title, location),
    );

    // Inject at top of grid
    galleryGrid.insertBefore(card, galleryGrid.firstChild);
    setupVideoHoverEngine();
  }

  /**
   * Action Deletion Sub-Router
   */
  function executeDeletion(id, cardElement) {
    const transaction = db.transaction(["vault"], "readwrite");
    transaction.objectStore("vault").delete(Number(id));

    transaction.onsuccess = () => {
      cardElement.remove();
      refreshInfinitePool();

      if (galleryGrid.children.length === 0) {
        emptyState.style.display = "flex";
        loadingSpinner.classList.add("hidden");
      }
    };
  }

  /**
   * Syncing Infinite Stream Mapping Layers
   */
  function refreshInfinitePool() {
    mediaPool = Array.from(galleryGrid.children).map((item) => {
      const freshClone = item.cloneNode(true);
      // Re-apply event listeners to cloned targets manually
      freshClone.addEventListener("click", () => {
        activeLightbox(
          item.dataset.url,
          item.dataset.type,
          item.dataset.title,
          item.dataset.location,
        );
      });
      const del = freshClone.querySelector(".delete-btn");
      if (del)
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          if (
            confirm(`Are you sure you want to delete "${item.dataset.title}"?`)
          ) {
            executeDeletion(item.dataset.id, item);
          }
        });
      return freshClone;
    });
  }

  /**
   * Active Lightbox Controller Viewer
   */
  function activeLightbox(url, type, title, location) {
    lightboxContent.innerHTML = ""; // reset view box completely

    if (type.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = url;
      lightboxContent.appendChild(img);
    } else {
      const video = document.createElement("video");
      video.src = url;
      video.controls = true;
      video.autoplay = true;
      lightboxContent.appendChild(video);
    }

    lightboxTitle.textContent = title;
    lightboxLocation.textContent = location;
    lightbox.classList.add("active");
  }

  // Close Lightbox Hooks
  lightboxClose.addEventListener("click", () => {
    lightbox.classList.remove("active");
    lightboxContent.innerHTML = "";
  });

  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) {
      lightbox.classList.remove("active");
      lightboxContent.innerHTML = "";
    }
  });

  /**
   * Video Hover Event Control Engine
   */
  function setupVideoHoverEngine() {
    document.querySelectorAll(".gallery-item video").forEach((video) => {
      const parent = video.parentElement;
      parent.onmouseenter = () => video.play().catch(() => {});
      parent.onmouseleave = () => {
        video.pause();
        video.currentTime = 0;
      };
    });
  }

  /**
   * Infinite Loop Loader Observer Engine
   */
  const loadMoreItems = (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && !isFetching && mediaPool.length > 0) {
        isFetching = true;
        setTimeout(() => {
          mediaPool.forEach((item) => {
            const targetClone = item.cloneNode(true);
            // Inherit Lightbox systems on lazy rendered loops
            targetClone.addEventListener("click", () =>
              activeLightbox(
                item.dataset.url,
                item.dataset.type,
                item.dataset.title,
                item.dataset.location,
              ),
            );
            galleryGrid.appendChild(targetClone);
          });
          setupVideoHoverEngine();
          isFetching = false;
        }, 400);
      }
    });
  };

  new IntersectionObserver(loadMoreItems, { rootMargin: "200px" }).observe(
    loadingSpinner,
  );
});
