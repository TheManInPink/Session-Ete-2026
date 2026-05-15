/**
 * @file        date.ts
 * @description Utilitaires de manipulation de dates pour la plateforme NINA-AES.
 *
 *              Fournit le calcul d'âge en années révolues à partir d'une
 *              date de naissance — utilisé pour le contrôle de majorité
 *              (vote, demande de carte d'identité, etc.).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      @nina-aes/utils
 */

/**
 * Calcule l'âge en **années révolues** d'une personne à une date donnée.
 *
 * Tient compte du jour et du mois (un anniversaire le 31 décembre n'est
 * pas considéré comme « passé » avant cette date).
 *
 * @param birthDate - Date de naissance (`Date` ou ISO string `YYYY-MM-DD`).
 * @param referenceDate - Date de référence (par défaut : `new Date()`).
 * @returns Âge en années entières (≥ 0).
 * @throws {Error} Si la date de naissance est postérieure à la référence
 *                 ou si le format est invalide.
 */
export function calculateAge(
  birthDate: Date | string,
  referenceDate: Date = new Date(),
): number {
  const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (Number.isNaN(birth.getTime())) {
    throw new Error(`Date de naissance invalide : "${String(birthDate)}"`);
  }
  if (birth.getTime() > referenceDate.getTime()) {
    throw new Error('La date de naissance est postérieure à la date de référence');
  }

  let age = referenceDate.getFullYear() - birth.getFullYear();
  const monthDiff = referenceDate.getMonth() - birth.getMonth();
  const dayDiff = referenceDate.getDate() - birth.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}
