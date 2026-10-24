-- LOCAL-ONLY compatibility for pinned Storage API 1.60.4 and newer local DB.
-- Apply as local supabase_admin only; never apply to Production.
-- The local API targets an unversioned (name, bucket_id) conflict key.
create unique index if not exists phase7_local_storage_object_key
  on storage.objects (name, bucket_id);
