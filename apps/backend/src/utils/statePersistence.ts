import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import { logger } from './logger';

/**
 * State persistence utility for storing critical runtime state to disk
 * Used for state that must survive process restarts (e.g., kill switch)
 */

// Zod schema for runtime validation of kill switch state
const KillSwitchStateSchema = z.object({
  killed: z.boolean(),
  timestamp: z.number().finite(),
  reason: z.string().optional(),
});

export interface KillSwitchState {
  killed: boolean;
  timestamp: number;
  reason?: string;
}

const STATE_DIR = path.join(process.cwd(), '.state');
const KILL_SWITCH_FILE = path.join(STATE_DIR, 'kill-switch.json');

/**
 * Ensure state directory exists
 */
async function ensureStateDir(): Promise<void> {
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
  } catch (error) {
    logger.error('Failed to create state directory', {
      error: error instanceof Error ? error.message : String(error),
      dir: STATE_DIR,
    });
    throw error;
  }
}

/**
 * Save kill switch state to disk
 */
export async function saveKillSwitchState(state: KillSwitchState): Promise<void> {
  try {
    await ensureStateDir();
    const data = JSON.stringify(state, null, 2);
    await fs.writeFile(KILL_SWITCH_FILE, data, 'utf-8');
    
    logger.info('Kill switch state saved', {
      killed: state.killed,
      timestamp: state.timestamp,
    });
  } catch (error) {
    logger.error('Failed to save kill switch state', {
      error: error instanceof Error ? error.message : String(error),
      file: KILL_SWITCH_FILE,
    });
    throw error;
  }
}

/**
 * Load kill switch state from disk
 * Returns null if file doesn't exist (first run or state was cleared)
 */
export async function loadKillSwitchState(): Promise<KillSwitchState | null> {
  try {
    const data = await fs.readFile(KILL_SWITCH_FILE, 'utf-8');
    const rawState = JSON.parse(data);
    
    // Validate structure with Zod
    const parseResult = KillSwitchStateSchema.safeParse(rawState);
    if (!parseResult.success) {
      logger.error('Kill switch state file has invalid structure', {
        errors: parseResult.error.issues,
        file: KILL_SWITCH_FILE,
      });
      throw new Error('Invalid kill switch state structure: ' + parseResult.error.message);
    }
    
    const state = parseResult.data;
    
    // Validate and calculate age
    const rawTimestamp = state.timestamp;
    let age: number;
    
    if (typeof rawTimestamp === 'number' && Number.isFinite(rawTimestamp)) {
      const now = Date.now();
      const diff = now - rawTimestamp;
      
      if (diff < 0) {
        logger.warn('Kill switch state timestamp is in the future', {
          timestamp: rawTimestamp,
          now,
          diff,
        });
        age = 0;
      } else {
        age = diff;
      }
    } else {
      logger.warn('Kill switch state has invalid timestamp', {
        rawTimestamp,
      });
      age = 0;
    }
    
    logger.info('Kill switch state loaded', {
      killed: state.killed,
      timestamp: state.timestamp,
      age,
    });
    
    return state;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist - this is normal on first run
      logger.info('No existing kill switch state found (first run or state cleared)');
      return null;
    }
    
    logger.error('Failed to load kill switch state', {
      error: error instanceof Error ? error.message : String(error),
      file: KILL_SWITCH_FILE,
    });
    throw error;
  }
}

/**
 * Clear kill switch state from disk
 */
export async function clearKillSwitchState(): Promise<void> {
  try {
    await fs.unlink(KILL_SWITCH_FILE);
    logger.info('Kill switch state cleared');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist - nothing to clear
      logger.debug('Kill switch state file does not exist');
      return;
    }
    
    logger.error('Failed to clear kill switch state', {
      error: error instanceof Error ? error.message : String(error),
      file: KILL_SWITCH_FILE,
    });
    throw error;
  }
}

/**
 * Get the state file path (for testing)
 */
export function getKillSwitchStatePath(): string {
  return KILL_SWITCH_FILE;
}
