import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import {
  saveKillSwitchState,
  loadKillSwitchState,
  clearKillSwitchState,
  getKillSwitchStatePath,
  KillSwitchState,
} from '../src/utils/statePersistence';

const TEST_STATE_DIR = path.join(process.cwd(), '.state');
const TEST_STATE_FILE = getKillSwitchStatePath();

describe('State Persistence', () => {
  // Clean up test state before and after each test
  beforeEach(async () => {
    try {
      await fs.rm(TEST_STATE_DIR, { recursive: true });
    } catch (error) {
      // Log only non-ENOENT errors for debugging
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        console.debug('Test cleanup beforeEach failed:', err.message);
      }
    }
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_STATE_DIR, { recursive: true });
    } catch (error) {
      // Log only non-ENOENT errors for debugging
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        console.debug('Test cleanup afterEach failed:', err.message);
      }
    }
  });

  describe('saveKillSwitchState', () => {
    it('should save kill switch state to disk', async () => {
      const state: KillSwitchState = {
        killed: true,
        timestamp: Date.now(),
        reason: 'test reason',
      };

      await saveKillSwitchState(state);

      // Verify file exists
      const fileExists = await fs.access(TEST_STATE_FILE).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      // Verify content
      const content = await fs.readFile(TEST_STATE_FILE, 'utf-8');
      const savedState = JSON.parse(content);
      expect(savedState.killed).toBe(true);
      expect(savedState.timestamp).toBe(state.timestamp);
      expect(savedState.reason).toBe('test reason');
    });

    it('should create state directory if it does not exist', async () => {
      const state: KillSwitchState = {
        killed: true,
        timestamp: Date.now(),
      };

      await saveKillSwitchState(state);

      // Verify directory was created
      const dirExists = await fs.access(TEST_STATE_DIR).then(() => true).catch(() => false);
      expect(dirExists).toBe(true);
    });

    it('should overwrite existing state', async () => {
      const state1: KillSwitchState = {
        killed: true,
        timestamp: Date.now(),
        reason: 'first reason',
      };

      await saveKillSwitchState(state1);

      const state2: KillSwitchState = {
        killed: false,
        timestamp: Date.now() + 1000,
        reason: 'second reason',
      };

      await saveKillSwitchState(state2);

      const loadedState = await loadKillSwitchState();
      expect(loadedState).not.toBeNull();
      expect(loadedState!.killed).toBe(false);
      expect(loadedState!.reason).toBe('second reason');
    });
  });

  describe('loadKillSwitchState', () => {
    it('should load kill switch state from disk', async () => {
      const state: KillSwitchState = {
        killed: true,
        timestamp: Date.now(),
        reason: 'test reason',
      };

      await saveKillSwitchState(state);
      const loadedState = await loadKillSwitchState();

      expect(loadedState).not.toBeNull();
      expect(loadedState!.killed).toBe(true);
      expect(loadedState!.timestamp).toBe(state.timestamp);
      expect(loadedState!.reason).toBe('test reason');
    });

    it('should return null if state file does not exist', async () => {
      const loadedState = await loadKillSwitchState();
      expect(loadedState).toBeNull();
    });

    it('should handle malformed JSON gracefully', async () => {
      // Create state directory
      await fs.mkdir(TEST_STATE_DIR, { recursive: true });
      
      // Write invalid JSON
      await fs.writeFile(TEST_STATE_FILE, 'invalid json', 'utf-8');

      // Should throw error for malformed JSON
      await expect(loadKillSwitchState()).rejects.toThrow();
    });
  });

  describe('clearKillSwitchState', () => {
    it('should delete kill switch state file', async () => {
      const state: KillSwitchState = {
        killed: true,
        timestamp: Date.now(),
      };

      await saveKillSwitchState(state);

      // Verify file exists
      let fileExists = await fs.access(TEST_STATE_FILE).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      await clearKillSwitchState();

      // Verify file was deleted
      fileExists = await fs.access(TEST_STATE_FILE).then(() => true).catch(() => false);
      expect(fileExists).toBe(false);
    });

    it('should not throw error if file does not exist', async () => {
      // Should not throw
      await expect(clearKillSwitchState()).resolves.not.toThrow();
    });
  });

  describe('Integration', () => {
    it('should support save-load-clear cycle', async () => {
      // Save state
      const state: KillSwitchState = {
        killed: true,
        timestamp: Date.now(),
        reason: 'integration test',
      };
      await saveKillSwitchState(state);

      // Load state
      let loadedState = await loadKillSwitchState();
      expect(loadedState).not.toBeNull();
      expect(loadedState!.killed).toBe(true);

      // Clear state
      await clearKillSwitchState();

      // Load should return null after clear
      loadedState = await loadKillSwitchState();
      expect(loadedState).toBeNull();
    });

    it('should persist state across multiple save operations', async () => {
      // Save initial state
      await saveKillSwitchState({
        killed: true,
        timestamp: Date.now(),
      });

      // Save updated state
      const newTimestamp = Date.now() + 5000;
      await saveKillSwitchState({
        killed: false,
        timestamp: newTimestamp,
        reason: 'reset',
      });

      // Load final state
      const loadedState = await loadKillSwitchState();
      expect(loadedState).not.toBeNull();
      expect(loadedState!.killed).toBe(false);
      expect(loadedState!.timestamp).toBe(newTimestamp);
      expect(loadedState!.reason).toBe('reset');
    });
  });
});
