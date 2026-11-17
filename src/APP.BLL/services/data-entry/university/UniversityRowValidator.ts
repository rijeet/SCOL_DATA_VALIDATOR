import { Injectable } from '@nestjs/common';
import { validateUniversityRowFields } from '@shared/validation/universityRowFieldValidation';

@Injectable()
export class UniversityRowValidator {
  validateRowFieldErrors(
    row: Record<string, string | undefined>,
  ): Record<string, string> {
    return validateUniversityRowFields(row);
  }

  isRowValid(fieldErrors: Record<string, string>): boolean {
    return Object.keys(fieldErrors).length === 0;
  }
}
