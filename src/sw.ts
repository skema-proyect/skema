/// <reference lib="webworker" />
/// <reference types="vite-plugin-pwa/vanillajs" />

import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener("push", event => {
  if (!event.data) return;
  const { title, body, tag, url } = event.data.json() as {
    title: string; body: string; tag?: string; url?: string;
  };
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/ant-skema.png",
      badge: "/ant-skema.png",
      tag: tag ?? "skema-reminder",
      data: { url: url ?? "/agenda" },
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      const url = (event.notification.data as { url?: string })?.url ?? "/agenda";
      const existing = clients.find(c => c.url.includes(url));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
