/**
 * @file        directive.state-machine.ts
 * @description Machine à états du cycle de vie Kanban d'une directive
 *              (`GovernanceTaskStatus`). Définit les transitions LÉGALES — toute
 *              transition non autorisée est rejetée (400) par le service.
 *
 *              Graphe :
 *                DRAFT       → SENT, REJECTED
 *                SENT        → IN_PROGRESS, REJECTED
 *                IN_PROGRESS → COMPLETED, REJECTED
 *                COMPLETED   → (terminal)
 *                REJECTED    → (terminal)
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/directives
 */

/** Statut de cycle de vie Kanban. */
export type TaskStatus = 'DRAFT' | 'SENT' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';

/** Transitions autorisées par statut courant. */
const ALLOWED: Record<TaskStatus, readonly TaskStatus[]> = {
  DRAFT: ['SENT', 'REJECTED'],
  SENT: ['IN_PROGRESS', 'REJECTED'],
  IN_PROGRESS: ['COMPLETED', 'REJECTED'],
  COMPLETED: [],
  REJECTED: [],
};

/**
 * Indique si la transition `from → to` est autorisée.
 *
 * @param from Statut courant.
 * @param to   Statut cible.
 * @returns `true` si la transition est légale.
 */
export function isTransitionAllowed(from: TaskStatus, to: TaskStatus): boolean {
  return ALLOWED[from].includes(to);
}
