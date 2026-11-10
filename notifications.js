const enableNotifications = document.getElementById("enableNotifications");
const disableNotifications = document.getElementById("disableNotifications");
const notificationStatus = document.getElementById("notificationStatus");
let notificationConfig;
let notificationRegistration;

function showNotificationStatus(message) {
  notificationStatus.textContent = message;
}

function decodeApplicationKey(key) {
  const padded = (key + "=".repeat((4 - key.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function subscriptionRequest(method, body) {
  const response = await fetch("/api/push/subscription", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || `Server error (${response.status}).`);
  }
}

async function initializeNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    showNotificationStatus("Push notifications are not supported here. On iPhone or iPad, install the app to your home screen first.");
    return;
  }
  if (window.location.hostname.endsWith(".github.io")) {
    showNotificationStatus("Daily notifications are available on the Fly-hosted version of this app.");
    return;
  }
  try {
    const response = await fetch("/api/push/config", { cache: "no-store" });
    if (!response.ok) {
      showNotificationStatus("Daily notifications are not configured on this server yet.");
      return;
    }
    notificationConfig = await response.json();
    notificationRegistration = await navigator.serviceWorker.ready;
    const existing = await notificationRegistration.pushManager.getSubscription();
    if (existing) {
      await subscriptionRequest("POST", existing.toJSON());
      disableNotifications.hidden = false;
      enableNotifications.hidden = true;
      showNotificationStatus("Daily notifications are enabled on this device.");
    } else if (Notification.permission === "denied") {
      showNotificationStatus("Notifications are blocked. Change your browser or device settings to enable them.");
    } else {
      enableNotifications.disabled = false;
      showNotificationStatus("Enable notifications to receive the daily discovery around 14:00 UTC.");
    }
  } catch (error) {
    console.error("Could not initialize notifications:", error);
    showNotificationStatus("Notification setup is unavailable. Check your connection and try reloading.");
  }
}

enableNotifications.addEventListener("click", async () => {
  enableNotifications.disabled = true;
  let subscription;
  try {
    const permission = await Notification.requestPermission();
    if (typeof window.updateNotificationPermission === "function") window.updateNotificationPermission();
    if (permission !== "granted") {
      showNotificationStatus("Notifications were not allowed. You can change this in your browser settings.");
      return;
    }
    subscription = await notificationRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeApplicationKey(notificationConfig.publicKey),
    });
    await subscriptionRequest("POST", subscription.toJSON());
    disableNotifications.hidden = false;
    enableNotifications.hidden = true;
    showNotificationStatus("Daily notifications are enabled on this device.");
  } catch (error) {
    console.error("Could not enable notifications:", error);
    if (subscription) {
      try {
        await subscription.unsubscribe();
      } catch (unsubscribeError) {
        console.error("Could not remove incomplete subscription:", unsubscribeError);
      }
    }
    showNotificationStatus("Could not enable notifications. Check your connection and try again.");
  } finally {
    enableNotifications.disabled = Notification.permission === "denied";
  }
});

disableNotifications.addEventListener("click", async () => {
  disableNotifications.disabled = true;
  try {
    const subscription = await notificationRegistration.pushManager.getSubscription();
    if (subscription) {
      await subscriptionRequest("DELETE", { endpoint: subscription.endpoint });
      if (!await subscription.unsubscribe()) throw new Error("Browser did not remove the subscription.");
    }
    disableNotifications.hidden = true;
    enableNotifications.hidden = false;
    showNotificationStatus("Daily notifications are off on this device.");
  } catch (error) {
    console.error("Could not turn off notifications:", error);
    showNotificationStatus("Could not turn off notifications. Check your connection and try again.");
  } finally {
    disableNotifications.disabled = false;
  }
});

initializeNotifications();
