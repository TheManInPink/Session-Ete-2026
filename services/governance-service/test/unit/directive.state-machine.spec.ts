/**
 * @file        directive.state-machine.spec.ts
 * @description Tests de la machine à états Kanban : transitions légales acceptées,
 *              transitions illégales refusées, états terminaux verrouillés.
 * @module      governance-service/test
 */
import {
  isTransitionAllowed,
  type TaskStatus,
} from '../../src/directives/directive.state-machine.js';

describe('directive.state-machine — transitions légales', () => {
  const legal: [TaskStatus, TaskStatus][] = [
    ['DRAFT', 'SENT'],
    ['DRAFT', 'REJECTED'],
    ['SENT', 'IN_PROGRESS'],
    ['SENT', 'REJECTED'],
    ['IN_PROGRESS', 'COMPLETED'],
    ['IN_PROGRESS', 'REJECTED'],
  ];

  it.each(legal)('autorise %s → %s', (from, to) => {
    expect(isTransitionAllowed(from, to)).toBe(true);
  });

  const illegal: [TaskStatus, TaskStatus][] = [
    ['DRAFT', 'IN_PROGRESS'], // saute SENT
    ['DRAFT', 'COMPLETED'],
    ['SENT', 'COMPLETED'], // saute IN_PROGRESS
    ['COMPLETED', 'IN_PROGRESS'], // terminal
    ['COMPLETED', 'SENT'],
    ['REJECTED', 'SENT'], // terminal
    ['IN_PROGRESS', 'SENT'], // pas de retour arrière
  ];

  it.each(illegal)('REFUSE %s → %s (transition invalide)', (from, to) => {
    expect(isTransitionAllowed(from, to)).toBe(false);
  });
});
