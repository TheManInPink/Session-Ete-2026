/**
 * @file        stepper.tsx
 * @description Stepper NINA-AES — fil d'étapes (wizard correction PC-03, …).
 *              A11y : <ol> sémantique, aria-current="step" sur l'étape courante.
 * @module      @nina-aes/ui
 */

import { Check } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

export interface StepperStep {
  label: string;
  description?: string;
}

export interface StepperProps extends React.HTMLAttributes<HTMLOListElement> {
  steps: StepperStep[];
  /** Index (0-based) de l'étape courante. */
  current: number;
  orientation?: 'horizontal' | 'vertical';
}

/** Fil d'étapes : pastille (done = ✓, current = numéro entouré, todo = grisé). */
export const Stepper = React.forwardRef<HTMLOListElement, StepperProps>(
  ({ className, steps, current, orientation = 'horizontal', ...props }, ref) => (
    <ol
      ref={ref}
      className={cn(
        orientation === 'horizontal' ? 'flex items-center' : 'flex flex-col',
        className,
      )}
      {...props}
    >
      {steps.map((step, i) => {
        const done = i < current;
        const isCurrent = i === current;
        const isLast = i === steps.length - 1;
        return (
          <li
            key={step.label}
            aria-current={isCurrent ? 'step' : undefined}
            className={cn(
              'flex',
              orientation === 'horizontal' ? 'flex-1 items-center last:flex-none' : 'gap-3',
            )}
          >
            <div
              className={cn('flex items-center gap-3', orientation === 'vertical' && 'flex-col')}
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold',
                  done && 'border-primary bg-primary text-primary-fg',
                  isCurrent && 'border-primary text-primary',
                  !done && !isCurrent && 'border-border text-fg-muted',
                )}
              >
                {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
              </span>
              <span
                className={cn(
                  'text-sm font-medium',
                  isCurrent || done ? 'text-fg' : 'text-fg-muted',
                  orientation === 'horizontal' && 'hidden sm:inline',
                )}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <span
                aria-hidden="true"
                className={cn(
                  orientation === 'horizontal' ? 'mx-2 h-0.5 flex-1' : 'my-1 ml-4 h-6 w-0.5',
                  done ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  ),
);
Stepper.displayName = 'Stepper';
