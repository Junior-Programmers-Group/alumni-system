import { useCallback, useEffect, useRef, useState } from 'react';

const initialHomeData = { news: [], events: [], metrics: null, gallery: [] };
const initialSiteConfig = { allowOpenSignups: true };

async function getJson(path, signal) {
  const response = await fetch(path, { signal });
  if (!response.ok) {
    throw new Error(`Request failed: ${path}`);
  }
  return response.json();
}

export function useHomeData() {
  const [homeData, setHomeData] = useState(initialHomeData);
  const [siteConfig, setSiteConfig] = useState(initialSiteConfig);
  const [homeError, setHomeError] = useState('');
  const activeRequest = useRef(null);

  const loadPublicContent = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setHomeError('');

    const results = await Promise.allSettled([
      getJson('/api/config', controller.signal),
      getJson('/api/home', controller.signal),
      getJson('/api/events', controller.signal),
      getJson('/api/gallery', controller.signal),
    ]);

    if (controller.signal.aborted) return;

    const [config, home, eventData, galleryData] = results;
    if (config.status === 'fulfilled') setSiteConfig(config.value);
    if (home.status === 'fulfilled') {
      setHomeData((current) => ({ ...current, ...home.value }));
    }
    if (eventData.status === 'fulfilled') {
      setHomeData((current) => ({ ...current, events: eventData.value.events || [] }));
    }
    if (galleryData.status === 'fulfilled') {
      setHomeData((current) => ({ ...current, gallery: galleryData.value.photos || [] }));
    }
    if (results.some((result) => result.status === 'rejected')) {
      setHomeError('Some public content could not be loaded. You can retry without refreshing the page.');
    }
  }, []);

  useEffect(() => {
    loadPublicContent();
    return () => activeRequest.current?.abort();
  }, [loadPublicContent]);

  return { homeData, siteConfig, homeError, loadPublicContent };
}
