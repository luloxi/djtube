-- Web Push subscriptions. One row per browser endpoint, owned by the signed-in email.
-- Pending users may subscribe. A row does not grant access.
create table push_subscription (
  endpoint text primary key,
  email text not null,
  p256dh text not null,
  auth text not null,
  created_at text not null
);

create index push_subscription_email_idx on push_subscription (email);
