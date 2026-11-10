import { Injectable } from '@angular/core';

export type BackgroundOperationType = 'network-evolution' | 'network-phasing' | 'route-tracing';

export interface BackgroundOperation {
  taskId: string;
  type: BackgroundOperationType;
  label: string;
  status: string;
  message?: string;
  sourceId?: number;
  outputNetworkId?: number;
  createdAt: number;
  updatedAt: number;
}

@Injectable({
  providedIn: 'root',
})
export class BackgroundOperationService {
  private readonly storageKey = 'thermal-network-background-operations-v1';
  private readonly activeStatuses = new Set(['PENDING', 'RECEIVED', 'STARTED', 'PROGRESS', 'RETRY', 'QUEUED', 'queued']);

  list(type?: BackgroundOperationType): BackgroundOperation[] {
    const operations = this.readAll();
    return type ? operations.filter(operation => operation.type === type) : operations;
  }

  active(type?: BackgroundOperationType): BackgroundOperation[] {
    return this.list(type).filter(operation => this.isActive(operation.status));
  }

  track(operation: Omit<BackgroundOperation, 'createdAt' | 'updatedAt'>): BackgroundOperation {
    const now = Date.now();
    const next: BackgroundOperation = {
      ...operation,
      status: operation.status || 'PENDING',
      createdAt: now,
      updatedAt: now,
    };
    const operations = this.readAll().filter(existing => existing.taskId !== next.taskId);
    operations.push(next);
    this.writeAll(operations);
    return next;
  }

  update(taskId: string, updates: Partial<BackgroundOperation>): BackgroundOperation | null {
    const operations = this.readAll();
    const index = operations.findIndex(operation => operation.taskId === taskId);
    if (index < 0) return null;

    operations[index] = {
      ...operations[index],
      ...updates,
      updatedAt: Date.now(),
    };
    this.writeAll(operations);
    return operations[index];
  }

  remove(taskId: string): void {
    this.writeAll(this.readAll().filter(operation => operation.taskId !== taskId));
  }

  isActive(status: string): boolean {
    return this.activeStatuses.has(status);
  }

  private readAll(): BackgroundOperation[] {
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private writeAll(operations: BackgroundOperation[]): void {
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(operations));
    } catch {
      // Local storage can be unavailable in private/incognito contexts.
    }
  }
}
