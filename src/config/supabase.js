import { createClient } from '@supabase/supabase-js';

/**
 * Supabase Client Configuration
 *
 * Handles file storage operations for:
 * - Inspection Excel files
 * - Job images
 * - Profile images (users, managers, entrepreneurs)
 * - Property images
 */

// Helper function to get config values (lazy evaluation)
const getSupabaseConfig = () => ({
  url: process.env.SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  anonKey: process.env.SUPABASE_ANON_KEY,
});

// Lazy-initialized clients
let _supabaseAdmin = null;
let _supabase = null;
let _initialized = false;

/**
 * Initialize Supabase clients
 */
const initializeClients = () => {
  if (_initialized) return;

  const { url, serviceKey, anonKey } = getSupabaseConfig();

  if (!url) {
    console.warn('[Supabase] ⚠ SUPABASE_URL not found in environment variables');
  }

  if (!serviceKey && !anonKey) {
    console.warn('[Supabase] ⚠ No Supabase keys found in environment variables');
  }

  // Create admin client
  if (url && serviceKey) {
    _supabaseAdmin = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  // Create anon client
  if (url && anonKey) {
    _supabase = createClient(url, anonKey);
  }

  _initialized = true;
};

/**
 * Supabase client with service role key (full access)
 * Use for server-side operations that bypass RLS
 */
export const getSupabaseAdmin = () => {
  initializeClients();
  return _supabaseAdmin;
};

/**
 * Supabase client with anon key (RLS enforced)
 * Use for user-facing operations
 */
export const getSupabase = () => {
  initializeClients();
  return _supabase;
};

// Export as properties for backward compatibility
export const supabaseAdmin = new Proxy({}, {
  get(target, prop) {
    const admin = getSupabaseAdmin();
    return admin ? admin[prop] : undefined;
  }
});

export const supabase = new Proxy({}, {
  get(target, prop) {
    const client = getSupabase();
    return client ? client[prop] : undefined;
  }
});

/**
 * Storage bucket names
 */
export const BUCKETS = {
  INSPECTIONS: 'inspections',
  JOB_IMAGES: 'job-images',
  PROFILE_IMAGES: 'profile-images',
  PROPERTY_IMAGES: 'property-images',
  MESSAGE_ATTACHMENTS: 'message-attachments',
};

/**
 * Check if Supabase is configured
 * @returns {boolean}
 */
export const isSupabaseConfigured = () => {
  const { url, serviceKey, anonKey } = getSupabaseConfig();
  return !!(url && (serviceKey || anonKey));
};

/**
 * Get Supabase configuration info
 * @returns {Object}
 */
export const getSupabaseInfo = () => {
  const { url, serviceKey, anonKey } = getSupabaseConfig();
  return {
    url: url || 'Not configured',
    hasServiceKey: !!serviceKey,
    hasAnonKey: !!anonKey,
    isConfigured: isSupabaseConfigured(),
    buckets: Object.values(BUCKETS),
  };
};

/**
 * Initialize Supabase buckets (run once during setup)
 * Creates all required storage buckets if they don't exist
 *
 * @returns {Promise<void>}
 */
export const initializeSupabaseBuckets = async () => {
  const admin = getSupabaseAdmin();
  if (!admin) {
    console.error('[Supabase] Cannot initialize buckets - Admin client not configured');
    return;
  }

  console.log('[Supabase] Initializing storage buckets...');

  const bucketConfigs = [
    {
      name: BUCKETS.INSPECTIONS,
      public: false,
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv', // .csv
      ],
    },
    {
      name: BUCKETS.JOB_IMAGES,
      public: true,
      fileSizeLimit: 5242880, // 5MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    },
    {
      name: BUCKETS.PROFILE_IMAGES,
      public: true,
      fileSizeLimit: 5242880, // 5MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    },
    {
      name: BUCKETS.PROPERTY_IMAGES,
      public: true,
      fileSizeLimit: 5242880, // 5MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    },
    {
      name: BUCKETS.MESSAGE_ATTACHMENTS,
      public: true,
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'application/zip',
      ],
    },
  ];

  for (const config of bucketConfigs) {
    try {
      // Check if bucket exists
      const { data: buckets, error: listError } = await admin.storage.listBuckets();

      if (listError) {
        console.error(`[Supabase] Error listing buckets:`, listError.message);
        continue;
      }

      const bucketExists = buckets.some((b) => b.name === config.name);

      if (!bucketExists) {
        // Create bucket
        const { data, error } = await admin.storage.createBucket(config.name, {
          public: config.public,
          fileSizeLimit: config.fileSizeLimit,
          allowedMimeTypes: config.allowedMimeTypes,
        });

        if (error) {
          console.error(`[Supabase] Error creating bucket "${config.name}":`, error.message);
        } else {
          console.log(`[Supabase] ✓ Created bucket: ${config.name}`);
        }
      } else {
        console.log(`[Supabase] ✓ Bucket "${config.name}" already exists`);
      }
    } catch (error) {
      console.error(`[Supabase] Error with bucket "${config.name}":`, error.message);
    }
  }

  console.log('[Supabase] Bucket initialization complete');
};

export default {
  supabase,
  supabaseAdmin,
  BUCKETS,
  isSupabaseConfigured,
  getSupabaseInfo,
  initializeSupabaseBuckets,
};
