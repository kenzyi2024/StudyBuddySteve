/* Study Buddy Steve — service worker for background push reminders. */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Study Buddy Steve', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || '⏰ Study Buddy Steve'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'You have a deadline coming up.',
      icon: '/steve/5.png',
      badge: '/steve/5.png',
      tag: 'steve-reminder',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
