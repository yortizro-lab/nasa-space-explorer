let installPrompt = null;
let installButton;
let installStatus;
let appInstalled = false;

function isAppleMobile() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

const appleInstallInstructions = "On iPhone or iPad, open this page in Safari. Tap Share, scroll down and tap Add to Home Screen. If it is missing, scroll to the bottom, tap Edit Actions, and add Add to Home Screen. Turn on Open as Web App if available, then tap Add.";

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
  installButton.textContent = installPrompt ? "Install App" : isAppleMobile() ? "Install on Home Screen" : "Install Options";
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
  else if (isAppleMobile() && !isInstalled() && window.isSecureContext !== false) showInstallMessage(appleInstallInstructions);

  installButton.addEventListener("click", async () => {
    if (!installPrompt) {
      showInstallMessage(window.isSecureContext === false
        ? "Installation requires HTTPS or localhost. Open the secure site and try again."
        : isAppleMobile()
          ? appleInstallInstructions
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
