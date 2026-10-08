// Bedside English service worker (SHELL_NAVIGATION.md §8 "Update banner", PLATFORM_MAPPING.md §1).
//
//  - App shell (index.html + the hashed build assets listed at build time) is precached, so the
//    installed app opens offline.
//  - Bundled content (/content/**) is cached as it is read and refreshed in the background.
//  - A new build installs but WAITS: it takes over only when the page posts SKIP_WAITING, which the
//    app does on the learner's "Restart now" tap and never during a live session.
//  - Provider/API requests and version.json are never cached or intercepted.
//
// `__BUILD__` and `__PRECACHE__` are replaced by scripts/pwaBuildPlugin.ts at build time.
const BUILD = "1791465918"
const PRECACHE = ["assets/index-CSlsFORT.js","assets/index-BQvvFcaf.css","manifest.webmanifest","icons/app-192.png","icons/apple-touch-icon-180.png"]
const SHELL_CACHE = `shell-${BUILD}`
const CONTENT_CACHE = 'content-v1'

const scopePath = new URL(self.registration.scope).pathname

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE)
    // A missing optional file must not fail the install; index.html must be there.
    await cache.add(new Request(scopePath, { cache: 'reload' }))
    await Promise.all(PRECACHE.map((path) => cache.add(new Request(scopePath + path, { cache: 'reload' })).catch(() => {})))
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('shell-') && name !== SHELL_CACHE) await caches.delete(name)
    }
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || (event.data && event.data.type === 'SKIP_WAITING')) self.skipWaiting()
})

async function shellFirst(request) {
  const cache = await caches.open(SHELL_CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CONTENT_CACHE)
  const hit = await cache.match(request)
  const refresh = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone())
    return response
  })
  if (hit) { refresh.catch(() => {}); return hit }
  return refresh
}

async function navigation(request) {
  try {
    return await fetch(request)
  } catch (error) {
    const shell = await (await caches.open(SHELL_CACHE)).match(scopePath)
    if (shell) return shell
    throw error
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith(scopePath)) return
  const path = url.pathname.slice(scopePath.length)
  if (path === 'version.json' || path === 'sw.js') return
  if (request.mode === 'navigate') { event.respondWith(navigation(request)); return }
  if (path.startsWith('content/')) { event.respondWith(staleWhileRevalidate(request)); return }
  if (path.startsWith('assets/') || path.startsWith('icons/') || path === 'manifest.webmanifest') event.respondWith(shellFirst(request))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil((async () => {
    const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // FeedbackNotification (`data.openHistory`): "your feedback is ready" opens History.
    const openHistory = event.notification.data && event.notification.data.openHistory
    if (pages.length > 0) {
      await pages[0].focus()
      if (openHistory) pages[0].postMessage('open-history')
      return
    }
    await self.clients.openWindow(scopePath)
  })())
})
