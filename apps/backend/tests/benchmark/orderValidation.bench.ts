import { bench, describe } from 'vitest';
import { validateOrderParameters, OrderParametersSchema } from '../../src/utils/orderValidation';

/**
 * Order Validation Benchmarks
 * 
 * These benchmarks measure the performance of order parameter validation,
 * which is executed on every order submission and is critical for preventing
 * invalid orders from entering the system (Audit Finding A-015).
 */

describe('Order Validation Performance', () => {
  // Valid order parameters
  const validOrder = {
    tokenId: '0x1234567890abcdef',
    side: 'BUY' as const,
    price: '0.55',
    size: '100',
  };

  // Various invalid orders (to test error paths)
  const invalidPriceOrder = {
    tokenId: '0x1234567890abcdef',
    side: 'BUY' as const,
    price: '1.5', // Invalid: > 1
    size: '100',
  };

  const invalidSideOrder = {
    tokenId: '0x1234567890abcdef',
    side: 'INVALID' as any,
    price: '0.55',
    size: '100',
  };

  bench('validateOrderParameters - valid order', () => {
    validateOrderParameters(validOrder);
  });

  bench('validateOrderParameters - invalid price', () => {
    validateOrderParameters(invalidPriceOrder);
  });

  bench('validateOrderParameters - invalid side', () => {
    validateOrderParameters(invalidSideOrder);
  });

  bench('OrderParametersSchema.safeParse - valid', () => {
    OrderParametersSchema.safeParse(validOrder);
  });

  bench('OrderParametersSchema.safeParse - invalid', () => {
    OrderParametersSchema.safeParse(invalidPriceOrder);
  });

  // Batch validation (simulating multiple orders)
  const orders = Array.from({ length: 10 }, (_, i) => ({
    tokenId: `0x${i.toString(16).padStart(40, '0')}`,
    side: (i % 2 === 0 ? 'BUY' : 'SELL') as const,
    price: (0.5 + i * 0.01).toFixed(2),
    size: String((i + 1) * 10),
  }));

  bench('batch validation - 10 orders', () => {
    orders.forEach(order => validateOrderParameters(order));
  });
});
