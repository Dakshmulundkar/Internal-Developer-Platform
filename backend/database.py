"""Supabase client singleton.

Import `supabase` from this module wherever database access is needed.
"""

from supabase import Client, create_client

from config import settings

# One client shared across the whole process — thread-safe for reads,
# and supabase-py handles connection pooling internally.
#
# We use the SERVICE ROLE key for all server-side queries so that RLS
# policies do not block us. Ownership enforcement is done explicitly in
# each router via get_current_user / owner_id comparisons.
supabase: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SERVICE_KEY or settings.SUPABASE_KEY,
)
