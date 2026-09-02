self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : { title: "Vectrace Emb", body: "You have a new CRM notification.", url: "/" };
  event.waitUntil(self.registration.showNotification(data.title || "Vectrace Emb", { body: data.body || "You have a new CRM notification.", icon: "/favicon.ico", data: { url: data.url || "/" } }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => windows[0] ? windows[0].focus() : clients.openWindow(event.notification.data.url)));
});
