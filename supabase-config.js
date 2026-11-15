
import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL =
  "https://tghhmwyshxybzpyrodvi.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_YiGpD0vTfcb0xWaxRg5Efg_xiZEksOU";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
