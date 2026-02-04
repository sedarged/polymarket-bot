import { z } from 'zod';

/**
 * Order Parameter Validation - Audit Finding A-015 & Issue #75
 * 
 * This module provides comprehensive input validation for order parameters
 * to prevent malformed orders from propagating through the system.
 * 
 * Validates:
 * - side: Must be 'BUY' or 'SELL'
 * - size: Must be a positive decimal string
 * - price: Must be a positive decimal string between 0 and 1 (probability)
 * - tokenId/market: Must be a non-empty string with valid format
 * - tick size: Price must align with market's tick size (Issue #75)
 * - minimum order size: Size must meet market's minimum (Issue #75)
 * 
 * All order ingress points (TradingClient, PaperTradingEngine) must use
 * these validation schemas before creating orders.
 * 
 * @see {@link ../../../../REPORTS/AUDIT.md} - Finding A-015
 * @see {@link ../../../../docs/small-pr-plan.md} - PR-004: Type Safety & Validation
 */

/**
 * Valid tick sizes for Polymarket markets
 * Tick size is the minimum price increment allowed for orders
 */
export type TickSize = '0.1' | '0.01' | '0.001' | '0.0001';

/**
 * Market constraints for order validation
 */
export interface MarketConstraints {
  tickSize: TickSize;
  minOrderSize: string; // Minimum order size in token units
}

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

/**
 * Validates that a price aligns with the market's tick size
 * 
 * Tick size is the minimum price increment. All order prices must be
 * exact multiples of the tick size, or the exchange will reject the order.
 * 
 * @param price - The order price as a number
 * @param tickSize - The market's tick size (e.g., "0.01")
 * @returns true if price is valid, false otherwise
 * 
 * @example
 * ```typescript
 * isPriceValidForTickSize(0.55, "0.01") // true
 * isPriceValidForTickSize(0.555, "0.01") // false
 * isPriceValidForTickSize(0.555, "0.001") // true
 * ```
 */
export function isPriceValidForTickSize(price: number, tickSize: TickSize): boolean {
  const tickSizeNum = Number(tickSize);
  
  // Price must be >= tick size
  if (price < tickSizeNum) {
    return false;
  }
  
  // Price must be a multiple of tick size (within floating point precision)
  // We check if (price / tickSize) is close to an integer
  const ratio = price / tickSizeNum;
  const roundedRatio = Math.round(ratio);
  const epsilon = 1e-10; // Tolerance for floating point errors
  
  return Math.abs(ratio - roundedRatio) < epsilon;
}

/**
 * Validates that an order size meets the market's minimum order size
 * 
 * @param size - The order size as a string
 * @param minOrderSize - The market's minimum order size as a string
 * @returns true if size is valid, false otherwise
 * 
 * @example
 * ```typescript
 * isSizeValidForMinimum("10", "1") // true
 * isSizeValidForMinimum("0.5", "1") // false
 * ```
 */
export function isSizeValidForMinimum(size: string, minOrderSize: string): boolean {
  const sizeNum = Number(size);
  const minSizeNum = Number(minOrderSize);
  
  if (isNaN(sizeNum) || isNaN(minSizeNum)) {
    return false;
  }
  
  return sizeNum >= minSizeNum;
}

/**
 * Validates order parameters with market constraints (tick size and min order size)
 * This is the enhanced validation that should be used when market metadata is available.
 * 
 * @param params - Raw order parameters to validate
 * @param constraints - Market constraints (tick size, min order size)
 * @returns ValidationResult with success flag and either data or error message
 * 
 * @example
 * ```typescript
 * const result = validateOrderWithConstraints(
 *   { tokenId: '0xabc', side: 'BUY', price: '0.55', size: '10' },
 *   { tickSize: '0.01', minOrderSize: '1' }
 * );
 * 
 * if (!result.success) {
 *   throw new Error(result.error);
 * }
 * ```
 */
export function validateOrderWithConstraints(
  params: unknown,
  constraints: MarketConstraints
): ValidationResult {
  // First validate basic parameters
  const basicValidation = validateOrderParameters(params);
  if (!basicValidation.success) {
    return basicValidation;
  }
  
  const validated = basicValidation.data!;
  const price = Number(validated.price);
  
  // Validate tick size
  if (!isPriceValidForTickSize(price, constraints.tickSize)) {
    return {
      success: false,
      error: `Invalid order parameters: price must align with tick size ${constraints.tickSize}. ` +
             `Price ${validated.price} is not a valid multiple of ${constraints.tickSize}.`,
    };
  }
  
  // Validate minimum order size
  if (!isSizeValidForMinimum(validated.size, constraints.minOrderSize)) {
    return {
      success: false,
      error: `Invalid order parameters: size must be at least ${constraints.minOrderSize}. ` +
             `Order size ${validated.size} is below the minimum.`,
    };
  }
  
  return {
    success: true,
    data: validated,
  };
}

/**
 * Validates order parameters with market constraints and throws on error
 * 
 * @param params - Raw order parameters to validate
 * @param constraints - Market constraints (tick size, min order size)
 * @returns Validated and typed order parameters
 * @throws Error if validation fails
 * 
 * @example
 * ```typescript
 * const validated = validateOrderWithConstraintsOrThrow(
 *   { tokenId: '0xabc', side: 'BUY', price: '0.55', size: '10' },
 *   { tickSize: '0.01', minOrderSize: '1' }
 * );
 * ```
 */
export function validateOrderWithConstraintsOrThrow(
  params: unknown,
  constraints: MarketConstraints
): OrderParameters {
  const result = validateOrderWithConstraints(params, constraints);
  
  if (!result.success) {
    throw new Error(result.error);
  }
  
  return result.data!;
}
