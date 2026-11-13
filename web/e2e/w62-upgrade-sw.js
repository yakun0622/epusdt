// W62 TEST-ONLY service worker: never shipped to src/www or web/dist.
// This models an explicit old Workbox → new network-first handoff on a
// disposable localhost origin. Real same-origin PWA release remains BLOCKED.
const W62_TEST_MIGRATION='w62-isolated-migration-v1';
self.addEventListener('install',event=>{
 event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
   // Remove ONLY the old Workbox pre-cache *inside this ephemeral origin*;
   // no global unregistration and never any production cache deletion.
   const names=await caches.keys();
   await Promise.all(names.filter(name=>name.startsWith('workbox-precache'))
     .map(name=>caches.delete(name)));
   await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 if(event.request.mode==='navigate'&&
     new URL(event.request.url).origin===self.location.origin){
   event.respondWith(fetch(event.request,{cache:'no-store'}));
 }
});
self.addEventListener('message',event=>{
 if(event.data==='W62_VERSION'&&event.ports[0])
   event.ports[0].postMessage(W62_TEST_MIGRATION);
});
