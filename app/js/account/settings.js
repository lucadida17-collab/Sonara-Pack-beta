const backButton = document.querySelector(
  ".settings-back-button"
);

const settingsRows = document.querySelectorAll(
  ".settings-row"
);

backButton.addEventListener("click", () => {
  window.location.href = "profile.html";
});

settingsRows.forEach((row) => {
  row.addEventListener("click", () => {
    const path = row.dataset.path;

    if (!path) {
      return;
    }

    window.location.href = path;
  });
});

lucide.createIcons();