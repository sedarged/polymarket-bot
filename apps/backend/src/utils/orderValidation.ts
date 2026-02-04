import { z } from 'zod';

/**
 * Order Parameter Validation - Audit Finding A-015
 * 
 * This module provides comprehensive input validation for order parameters
 * to prevent malformed orders from propagating through the system.
 * 
 * Validates:
 * - side: Must be 'BUY' or 'SELL'
 * - size: Must be a positive decimal string
 * - price: Must be a positive decimal string between 0 and 1 (probability)
 * - tokenId/market: Must be a non-empty string with valid format
 * 
 * All order ingress points (TradingClient, PaperTradingEngine) must use
 * these validation schemas before creating orders.
 * 
 * @see {@link ../../../../REPORTS/AUDIT.md} - Finding A-015
 * @see {@link ../../../../docs/small-pr-plan.md} - PR-004: Type Safety & Validation
 */

/**
 * Validates a decimal string is a positive number
 * Accepts both number and string formats
 */
const positiveDecimalString = z
  .union([z.string(), z.number()])
  .refine(
    (val) => {
      const num = typeof val === 'string' ? Number(val) : val;
      return !isNaN(num) && isFinite(num) && num > 0;
    },
    {
      message: 'Must be a positive number',
    }
  )
  .transform((val) => String(val));

/**
 * Validates price is between 0 and 1 (exclusive)
 * Polymarket uses probability-based pricing where 0 < price < 1
 */
const priceString = z
  .union([z.string(), z.number()])
  .refine(
    (val) => {
      const num = typeof val === 'string' ? Number(val) : val;
      return !isNaN(num) && isFinite(num) && num > 0 && num < 1;
    },
    {
      message: 'Price must be between 0 and 1 (exclusive)',
    }
  )
  .transform((val) => String(val));

/**
 * Validates token ID format
 * Token IDs should be non-empty strings, typically hexadecimal addresses
 */
const tokenIdString = z
  .string()
  .min(1, 'Token ID cannot be empty')
  .refine(
    (val) => val.trim().length > 0,
    {
      message: 'Token ID cannot be whitespace only',
    }
  );

/**
 * Order side enum
 */
export const OrderSideSchema = z.enum(['BUY', 'SELL'], {
  errorMap: () => ({ message: 'Side must be either BUY or SELL' }),
});

/**
 * Complete order parameters validation schema
 * Use this at all order creation ingress points
 */
export const OrderParametersSchema = z.object({
  tokenId: tokenIdString,
  side: OrderSideSchema,
  price: priceString,
  size: positiveDecimalString,
  clientOrderId: z.string().optional(),
});

export type OrderParameters = z.infer<typeof OrderParametersSchema>;

/**
 * Validation result type
 */
export interface ValidationResult {
  success: boolean;
  error?: string;
  data?: OrderParameters;
}

/**
 * Validates order parameters and returns a result
 * This function provides a safe way to validate order parameters
 * with detailed error messages.
 * 
 * @param params - Raw order parameters to validate
 * @returns ValidationResult with success flag and either data or error message
 * 
 * @example
 * ```typescript
 * const result = validateOrderParameters({
 *   tokenId: '0xabc123',
 *   side: 'BUY',
 *   price: '0.55',
 *   size: '10'
 * });
 * 
 * if (!result.success) {
 *   throw new Error(result.error);
 * }
 * 
 * // Use result.data for validated parameters
 * ```
 */
export function validateOrderParameters(
  params: unknown
): ValidationResult {
  const result = OrderParametersSchema.safeParse(params);

  if (!result.success) {
    const errors = result.error.issues
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join('; ');
    return {
      success: false,
      error: `Invalid order parameters: ${errors}`,
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

/**
 * Validates order parameters and throws on error
 * Use this when you want to fail fast with an exception
 * 
 * @param params - Raw order parameters to validate
 * @returns Validated and typed order parameters
 * @throws Error if validation fails
 * 
 * @example
 * ```typescript
 * const validated = validateOrderParametersOrThrow({
 *   tokenId: '0xabc123',
 *   side: 'BUY',
 *   price: '0.55',
 *   size: '10'
 * });
 * // validated is now properly typed as OrderParameters
 * ```
 */
export function validateOrderParametersOrThrow(
  params: unknown
): OrderParameters {
  const result = validateOrderParameters(params);
  
  if (!result.success) {
    throw new Error(result.error);
  }
  
  return result.data!;
}
