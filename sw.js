const versionTag = `v1.0`;

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(resp => {
      return resp || fetch(event.request).then(response => {
        return caches.open(versionTag).then(cache => {
          if (event.request.url.indexOf('http') === 0) cache.put(event.request, response.clone());
          return response;
        });  
      });
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map(key => {
        if (versionTag !== key) {
          return caches.delete(key);
        }
      }));
    })
  );
});