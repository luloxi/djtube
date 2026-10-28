-- BPM, beat grid and waveform peaks for one signed-in user.
-- Shared across that user's devices. IndexedDB stays the local cache.
-- Rows are not readable by other accounts.
create table track_analysis (
  email text not null,
  video_id text not null,
  bpm real,
  beat_offset real,
  duration real not null default 0,
  peaks text not null,
  updated_at text not null,
  primary key (email, video_id)
);

create index track_analysis_email_idx on track_analysis (email);
