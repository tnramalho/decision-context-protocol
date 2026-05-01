export interface ActiveRepoContext {
  owner: string;
  repo: string;
  branch: string;
}

export class ActiveRepoStore {
  private activeRepo: ActiveRepoContext | null = null;

  set(repo: ActiveRepoContext): ActiveRepoContext {
    this.activeRepo = repo;
    return repo;
  }

  get(): ActiveRepoContext | null {
    return this.activeRepo;
  }

  require(): ActiveRepoContext {
    if (!this.activeRepo) {
      throw new Error("No active repository set. Call set_active_repo first.");
    }

    return this.activeRepo;
  }

  reset(): ActiveRepoContext | null {
    const previous = this.activeRepo;
    this.activeRepo = null;
    return previous;
  }
}
