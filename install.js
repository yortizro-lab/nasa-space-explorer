const installButton = document.getElementById("installButton");
const installStatus = document.getElementById("installStatus");
let installPrompt = null;

function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function showInstallMessage(message) {
  installStatus.textContent = message;
  installStatus.hidden = false;
}

if (isInstalled()) installButton.hidden = true;

window.addEventListener("beforeinstallprompt", (event) => {
  if (isInstalled()) return;
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  installButton.hidden = true;
  showInstallMessage("Space Explorer has been installed.");
});

installButton.addEventListener("click", async () => {
  if (!installPrompt) {
    const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    showInstallMessage(isAppleMobile
      ? "In Safari, tap Share, then Add to Home Screen."
      : "Open your browser menu and look for Install app or Add to Home screen. If unavailable, try a supported browser over HTTPS.");
    return;
  }

  const prompt = installPrompt;
  installPrompt = null;
  installButton.disabled = true;
  try {
    await prompt.prompt();
    const result = await prompt.userChoice;
    if (result.outcome === "accepted") {
      showInstallMessage("Installation accepted. Follow your browser's instructions to finish.");
    } else {
      showInstallMessage("Installation canceled. You can try again from your browser menu.");
    }
  } catch (error) {
    console.error("Installation prompt failed:", error);
    showInstallMessage("Could not open the install prompt. Try your browser's install or Add to Home screen menu.");
  } finally {
    installButton.disabled = false;
  }
});
