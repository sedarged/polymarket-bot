import { LogService } from './logService';

export class KillSwitch {
  private enabled = false;

  constructor(private logger: LogService) {}

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.logger.warn('Kill switch toggled', { enabled });
  }
}
