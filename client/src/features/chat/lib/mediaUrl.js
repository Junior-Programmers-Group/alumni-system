import { createAsyncCache } from '../../../../../shared/asyncCache.mjs';
import { supabase } from '../../../services/supabase.js';

const signedMediaCache = createAsyncCache({ ttlMs: 55 * 60_000, maxEntries: 300 });
let mediaCacheUser;

supabase.auth.onAuthStateChange((_event, session) => {
  if (mediaCacheUser !== session?.user?.id) {
    signedMediaCache.clear();
    mediaCacheUser = session?.user?.id;
  }
});

export async function mediaUrl(path) {
  if (!path) return '';
  if (/^https:\/\//i.test(path)) return path;

  return signedMediaCache.get(path, async () => {
    const { data, error } = await supabase.storage
      .from('chat-attachments')
      .createSignedUrl(path, 3600);

    if (error) throw error;
    return data.signedUrl;
  });
}
