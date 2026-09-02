export interface Repository<T extends { id: string }, Filter = Record<string, never>> {
  findAll(filter?: Filter): Promise<T[]>;
  findById(id: string): Promise<T | undefined>;
  create(data: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T | undefined>;
  delete(id: string): Promise<boolean>;
}
