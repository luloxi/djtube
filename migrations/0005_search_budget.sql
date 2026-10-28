-- Daily count of YouTube Data API calls made with the shared worker key.
-- subject is a hash (user email or IP), never the raw address. day is UTC.
create table search_budget (
  subject text not null,
  day text not null,
  used integer not null default 0,
  primary key (subject, day)
);
