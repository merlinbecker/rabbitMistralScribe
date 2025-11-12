import { z } from 'zod';

/**
 * Environment variable validation schema
 * Validates required and optional environment variables at startup
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5000'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters for security'),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  MISTRAL_STT_MODEL: z.string().default('voxtral-24.02'),
  MISTRAL_SUMMARIZER_MODEL: z.string().default('mistral-large-latest'),
  REPL_HOME: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

/**
 * Validates environment variables and returns parsed config
 * Throws detailed error if validation fails
 */
export function validateConfig(): Config {
  try {
    const config = envSchema.parse(process.env);
    
    // Warn if GitHub OAuth is not configured
    if (!config.GITHUB_CLIENT_ID || !config.GITHUB_CLIENT_SECRET) {
      console.warn('[CONFIG] ⚠️  GitHub OAuth is not configured. Authentication will not work.');
      console.warn('[CONFIG] ⚠️  Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.');
    }
    
    console.log('[CONFIG] ✅ Environment variables validated successfully');
    console.log('[CONFIG] Environment:', config.NODE_ENV);
    console.log('[CONFIG] Port:', config.PORT);
    console.log('[CONFIG] GitHub OAuth:', config.GITHUB_CLIENT_ID ? 'Configured' : 'Not configured');
    
    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[CONFIG] ❌ Environment variable validation failed:');
      error.errors.forEach(err => {
        console.error(`[CONFIG]   - ${err.path.join('.')}: ${err.message}`);
      });
      console.error('\n[CONFIG] Please check your .env file or environment variables.');
      console.error('[CONFIG] See .env.example for required variables.\n');
    }
    throw error;
  }
}

/**
 * Get validated config singleton
 * Call validateConfig() first in server startup
 */
export let config: Config;

/**
 * Initialize config - should be called once at server startup
 */
export function initConfig(): Config {
  config = validateConfig();
  return config;
}
