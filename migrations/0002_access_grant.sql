-- Who signed in, and whether Luciano let them mix.
-- Status is pending until /admin says otherwise. The owner email is allowed in code even if this row says blocked.
create table access_grant (
  email text primary key,
  name text,
  avatar text,
  status text not null default 'pending',
  first_seen text not null,
  last_seen text not null,
  visit_count integer not null default 1,
  last_session_id text
);

create index access_grant_last_seen_idx on access_grant (last_seen);
