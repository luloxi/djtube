-- Per-user data for signed-in people, keyed by the normalized session email.
-- The YouTube API key is stored only as AES-GCM ciphertext (see worker/secret-box.ts).
create table account_key (
  email text primary key,
  yt_key_enc text not null,
  updated_at text not null
);

-- Playlists saved from the queue. tracks is a JSON array of {videoId, title}.
create table saved_playlist (
  id text primary key,
  email text not null,
  name text not null,
  tracks text not null,
  track_count integer not null,
  created_at text not null,
  updated_at text not null
);

create index saved_playlist_email_idx on saved_playlist (email, updated_at);
