let installPrompt = null;
let installButton;
let installStatus;
let appInstalled = false;

function isInstalled() {
  return appInstalled || window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function showInstallMessage(message) {
  installStatus.textContent = message;
  installStatus.hidden = false;
}

function updateInstallButton() {
  if (!installButton) return;
  installButton.hidden = isInstalled();
  installButton.textContent = installPrompt ? "Install App" : "Install Options";
}

window.addEventListener("beforeinstallprompt", (event) => {
  if (isInstalled()) return;
  event.preventDefault();
  installPrompt = event;
  updateInstallButton();
});

window.addEventListener("appinstalled", () => {
  appInstalled = true;
  installPrompt = null;
  updateInstallButton();
  if (installStatus) showInstallMessage("Space Explorer has been installed.");
});

function initializeInstall() {
  installButton = document.getElementById("installButton");
  installStatus = document.getElementById("installStatus");
  updateInstallButton();
  if (appInstalled) showInstallMessage("Space Explorer has been installed.");

  installButton.addEventListener("click", async () => {
    if (!installPrompt) {
      const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      showInstallMessage(window.isSecureContext === false
        ? "Installation requires HTTPS or localhost. Open the secure site and try again."
        : isAppleMobile
          ? "On iPhone or iPad, open this page in Safari, tap Share, then Add to Home Screen."
          : "The browser install prompt is not available yet. Open your browser menu and look for Install app or Add to Home screen; availability varies by browser.");
      return;
    }

    const prompt = installPrompt;
    installPrompt = null;
    installButton.disabled = true;
    updateInstallButton();
    try {
      await prompt.prompt();
      const result = await prompt.userChoice;
      if (!appInstalled) {
        showInstallMessage(result.outcome === "accepted"
          ? "Installation accepted. Follow your browser's instructions to finish."
          : "Installation canceled. You can try again from your browser menu.");
      }
    } catch (error) {
      console.error("Installation prompt failed:", error);
      if (!appInstalled) {
        showInstallMessage("Could not open the install prompt. Try your browser's install or Add to Home screen menu.");
      }
    } finally {
      installButton.disabled = false;
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeInstall, { once: true });
} else {
  initializeInstall();
}
