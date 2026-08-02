import { create } from 'zustand';

interface BookmarkState {
  bookmarkedNewsIds: Set<string>;
  savedAlbumIds: Set<string>;
  toggleNewsBookmark: (id: string) => void;
  toggleAlbumSave: (id: string) => void;
  isNewsBookmarked: (id: string) => boolean;
  isAlbumSaved: (id: string) => boolean;
}

/**
 * Lightweight client-side bookmark state. Swap for a persisted/synced
 * implementation (e.g. AsyncStorage + server sync) without touching consumers.
 */
export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  bookmarkedNewsIds: new Set(),
  savedAlbumIds: new Set(),
  toggleNewsBookmark: (id) =>
    set((state) => {
      const next = new Set(state.bookmarkedNewsIds);
      next.has(id) ? next.delete(id) : next.add(id);
      return { bookmarkedNewsIds: next };
    }),
  toggleAlbumSave: (id) =>
    set((state) => {
      const next = new Set(state.savedAlbumIds);
      next.has(id) ? next.delete(id) : next.add(id);
      return { savedAlbumIds: next };
    }),
  isNewsBookmarked: (id) => get().bookmarkedNewsIds.has(id),
  isAlbumSaved: (id) => get().savedAlbumIds.has(id),
}));
